import {
  ISearch,
  IAnimeInfo,
  IAnimeResult,
  ISource,
  IEpisodeServer,
  MovieParser,
  TvType,
  IMovieResult,
  IMovieInfo,
  ProxyConfig,
  IMovieEpisode,
} from '../../models';
import { IPeopleResult } from '../../models/types';
import { compareTwoStrings } from '../../utils';
import FlixHQ from '../movies/flixhq';
import { AxiosAdapter } from 'axios';
import NodeCache from 'node-cache';

class TMDB extends MovieParser {
  private cache: NodeCache;
  private provider: MovieParser;

  constructor(
    private apiKey: string = '5201b54eb0968700e693a30576d7d4dc',
    provider?: MovieParser,
    proxyConfig?: ProxyConfig,
    adapter?: AxiosAdapter
  ) {
    super(proxyConfig, adapter);
    this.provider = provider || new FlixHQ();
    this.cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour
  }

  private async fetchFromTMDB(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) return cachedData;

    const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
    url.searchParams.append('api_key', this.apiKey);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, String(value)));

    const { data } = await this.client.get(url.toString());
    this.cache.set(cacheKey, data);
    return data;
  }

  private mapToMovieResult(result: any): IMovieResult | IPeopleResult {
    const date = new Date(result?.release_date || result?.first_air_date);
    if (result.media_type !== 'person') {
      return {
        id: result.id,
        title: result?.title || result?.name,
        image: `https://image.tmdb.org/t/p/w500${result?.poster_path}`, // Use smaller image
        type: result.media_type === 'movie' ? TvType.MOVIE : TvType.TVSERIES,
        rating: result?.vote_average || 0,
        releaseDate: date.getFullYear().toString() || '0',
      };
    } else {
      return {
        id: result.id,
        name: result.name,
        rating: result.popularity,
        image: `https://image.tmdb.org/t/p/w500${result?.profile_path}`, // Use smaller image
        movies: (result['known_for'] || []).map(this.mapToMovieResult.bind(this)),
      };
    }
  }

  fetchTrending = async (
    type: string | 'all',
    timePeriod: 'day' | 'week' = 'day',
    page: number = 1
  ): Promise<ISearch<IMovieResult | IAnimeResult | IPeopleResult>> => {
    const mediaType = type.toLowerCase() === TvType.MOVIE.toLowerCase()
      ? 'movie'
      : type.toLowerCase() === TvType.TVSERIES.toLowerCase()
      ? 'tv'
      : type.toLowerCase() === TvType.PEOPLE.toLowerCase()
      ? 'person'
      : 'all';

    const data = await this.fetchFromTMDB(`/trending/${mediaType}/${timePeriod}`, { page });

    return {
      currentPage: page,
      hasNextPage: page + 1 <= data.total_pages,
      results: data.results.map(this.mapToMovieResult.bind(this)),
      totalResults: data.total_results,
      totalPages: data.total_pages,
    };
  };

  override search = async (
    query: string,
    page: number = 1
  ): Promise<ISearch<IMovieResult | IAnimeResult>> => {
    const data = await this.fetchFromTMDB('/search/multi', { page, include_adult: false, query });

    return {
      currentPage: page,
      hasNextPage: page + 1 <= data.total_pages,
      results: data.results.map(this.mapToMovieResult.bind(this)),
      totalResults: data.total_results,
      totalPages: data.total_pages,
    };
  };

  override fetchMediaInfo = async (mediaId: string, type: string): Promise<IMovieInfo | IAnimeInfo> => {
    const mediaType = type.toLowerCase() === 'movie' ? 'movie' : 'tv';
    const [data, credits, videos] = await Promise.all([
      this.fetchFromTMDB(`/${mediaType}/${mediaId}`, { language: 'en-US' }),
      this.fetchFromTMDB(`/${mediaType}/${mediaId}/credits`),
      this.fetchFromTMDB(`/${mediaType}/${mediaId}/videos`)
    ]);

    const providerId = await this.findIdFromTitle(data?.title || data?.name, {
      type: mediaType === 'movie' ? TvType.MOVIE : TvType.TVSERIES,
      totalSeasons: data?.number_of_seasons,
      totalEpisodes: data?.number_of_episodes,
      year: new Date(data?.release_date || data?.first_air_date).getFullYear(),
    });

    const InfoFromProvider = await this.provider.fetchMediaInfo(providerId as string);

    const info: IMovieInfo = {
      id: providerId as string,
      title: data?.title || data?.name,
      image: `https://image.tmdb.org/t/p/w500${data?.poster_path}`,
      cover: `https://image.tmdb.org/t/p/w1280${data?.backdrop_path}`,
      rating: data?.vote_average || 0,
      releaseDate: data?.release_date || data?.first_air_date,
      description: data?.overview,
      genres: data?.genres?.map((genre: any) => genre.name),
      duration: data?.runtime || data?.episode_run_time?.[0],
      totalEpisodes: data?.number_of_episodes,
      totalSeasons: data?.number_of_seasons,
      directors: credits?.crew?.filter((crew: any) => crew.job === 'Director').map((crew: any) => crew.name),
      writers: credits?.crew?.filter((crew: any) => crew.job === 'Screenplay').map((crew: any) => crew.name),
      actors: credits?.cast?.slice(0, 10).map((cast: any) => cast.name), // Limit to top 10 actors
      trailer: videos?.results?.[0] ? {
        id: videos.results[0].key,
        site: videos.results[0].site,
        url: `https://www.youtube.com/watch?v=${videos.results[0].key}`,
      } : undefined,
    };

    if (mediaType === 'tv' && info.totalSeasons) {
      info.seasons = await this.fetchSeasons(mediaId, info.totalSeasons, InfoFromProvider?.episodes);
    }

    return info;
  };

  private async fetchSeasons(mediaId: string, totalSeasons: number, providerEpisodes: any[]): Promise<any[]> {
    const seasonPromises = Array.from({ length: totalSeasons }, (_, i) =>
      this.fetchFromTMDB(`/tv/${mediaId}/season/${i + 1}`)
    );
    const seasonsData = await Promise.all(seasonPromises);

    return seasonsData.map((seasonData, i) => ({
      season: i + 1,
      image: seasonData?.poster_path ? {
        mobile: `https://image.tmdb.org/t/p/w300${seasonData.poster_path}`,
        hd: `https://image.tmdb.org/t/p/w780${seasonData.poster_path}`,
      } : undefined,
      episodes: this.mapEpisodes(seasonData?.episodes, providerEpisodes?.filter(episode => episode.season === i + 1)),
      isReleased: new Date(seasonData?.air_date) <= new Date(),
    }));
  }

  private mapEpisodes(tmdbEpisodes: any[], providerEpisodes: any[]): IMovieEpisode[] {
    return tmdbEpisodes.map(episode => {
      const episodeFromProvider = providerEpisodes?.find(ep => ep.number === episode.episode_number);
      return {
        id: episodeFromProvider?.id,
        title: episode.name,
        episode: episode.episode_number,
        season: episode.season_number,
        releaseDate: episode.air_date,
        description: episode.overview,
        url: episodeFromProvider?.url,
        img: episode?.still_path ? {
          mobile: `https://image.tmdb.org/t/p/w300${episode.still_path}`,
          hd: `https://image.tmdb.org/t/p/w780${episode.still_path}`,
        } : undefined,
      };
    });
  }

  private async findIdFromTitle(title: string, extraData: { type: TvType; year?: number; totalSeasons?: number; totalEpisodes?: number; [key: string]: any }): Promise<string | undefined> {
    const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase();
    const cacheKey = `findId:${cleanTitle}:${JSON.stringify(extraData)}`;
    const cachedId = this.cache.get(cacheKey);
    if (cachedId) return cachedId as string;

    const findMedia = await this.provider.search(cleanTitle) as ISearch<IAnimeResult>;
    if (findMedia.results.length === 0) return '';

    let results = findMedia.results
      .filter(result => result.type === extraData.type)
      .sort((a, b) => compareTwoStrings(cleanTitle, (b.title as string).toLowerCase()) - compareTwoStrings(cleanTitle, (a.title as string).toLowerCase()));

    if (extraData.year && extraData.type === TvType.MOVIE) {
      results = results.filter(result => result.releaseDate?.split('-')[0] === String(extraData.year));
    }

    if (extraData.totalSeasons && extraData.type === TvType.TVSERIES) {
      results = results.filter(result => {
        const totalSeasons = (result.seasons as number) || 0;
        return totalSeasons >= extraData.totalSeasons! - 2 && totalSeasons <= extraData.totalSeasons! + 2;
      });
    }

    const id = results[0]?.id;
    if (id) this.cache.set(cacheKey, id);
    return id;
  }

  override fetchEpisodeSources = async (id: string, ...args: any): Promise<ISource> => {
    return this.provider.fetchEpisodeSources(id, ...args);
  };

  override fetchEpisodeServers = async (episodeId: string, ...args: any): Promise<IEpisodeServer[]> => {
    return this.provider.fetchEpisodeServers(episodeId, ...args);
  };
}

export default TMDB;
