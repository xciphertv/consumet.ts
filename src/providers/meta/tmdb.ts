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

class TMDB extends MovieParser {
  override readonly name = 'TMDB';
  protected override baseUrl = 'https://www.themoviedb.org';
  protected apiUrl = 'https://api.themoviedb.org/3';
  protected override logo = 'https://pbs.twimg.com/profile_images/1243623122089041920/gVZIvphd_400x400.jpg';
  protected override classPath = 'META.TMDB';
  override supportedTypes = new Set([TvType.MOVIE, TvType.TVSERIES, TvType.ANIME]);

  private provider: MovieParser;

  constructor(
    private apiKey: string = '5201b54eb0968700e693a30576d7d4dc',
    provider?: MovieParser,
    proxyConfig?: ProxyConfig,
    adapter?: AxiosAdapter
  ) {
    super(proxyConfig, adapter);
    this.provider = provider || new FlixHQ();
  }

  private async fetchFromApi(url: string) {
    try {
      const { data } = await this.client.get(url);
      return data;
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }

  private mapToMovieResult(result: any): IMovieResult | IPeopleResult {
    if (result.media_type !== 'person') {
      const date = new Date(result?.release_date || result?.first_air_date);
      return {
        id: result.id,
        title: result?.title || result?.name,
        image: `https://image.tmdb.org/t/p/original${result?.poster_path}`,
        type: result.media_type === 'movie' ? TvType.MOVIE : TvType.TVSERIES,
        rating: result?.vote_average || 0,
        releaseDate: date.getFullYear().toString() || '0',
      };
    } else {
      const user: IPeopleResult = {
        id: result.id,
        name: result.name,
        rating: result.popularity,
        image: `https://image.tmdb.org/t/p/original${result?.profile_path}`,
        movies: result['known_for'].map(this.mapToMovieResult),
      };
      return user;
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

    const trendingUrl = `${this.apiUrl}/trending/${mediaType}/${timePeriod}?page=${page}&api_key=${this.apiKey}&language=en-US`;

    const data = await this.fetchFromApi(trendingUrl);

    return {
      currentPage: page,
      hasNextPage: page + 1 <= data.total_pages,
      results: data.results.map(this.mapToMovieResult),
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  };

  override search = async (
    query: string,
    page: number = 1
  ): Promise<ISearch<IMovieResult | IAnimeResult>> => {
    const searchUrl = `${this.apiUrl}/search/multi?api_key=${this.apiKey}&language=en-US&page=${page}&include_adult=false&query=${query}`;

    const data = await this.fetchFromApi(searchUrl);

    return {
      currentPage: page,
      hasNextPage: page + 1 <= data.total_pages,
      results: data.results.map(this.mapToMovieResult),
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  };

  override fetchMediaInfo = async (mediaId: string, type: string): Promise<IMovieInfo | IAnimeInfo> => {
    const mediaType = type.toLowerCase() === 'movie' ? 'movie' : 'tv';
    const infoUrl = `${this.apiUrl}/${mediaType}/${mediaId}?api_key=${this.apiKey}&language=en-US&append_to_response=release_dates,watch/providers,alternative_titles,credits,external_ids,images,keywords,recommendations,reviews,similar,translations,videos&include_image_language=en`;

    const data = await this.fetchFromApi(infoUrl);

    const providerId = await this.findIdFromTitle(data?.title || data?.name, {
      type: mediaType === 'movie' ? TvType.MOVIE : TvType.TVSERIES,
      totalSeasons: data?.number_of_seasons,
      totalEpisodes: data?.number_of_episodes,
      year: new Date(data?.release_year || data?.first_air_date).getFullYear(),
    });

    const InfoFromProvider = await this.provider.fetchMediaInfo(providerId as string);

    const info: IMovieInfo = {
      id: providerId as string,
      title: data?.title || data?.name,
      translations: data?.translations?.translations.map((translation: any) => ({
        title: translation.data?.title || data?.name || undefined,
        description: translation.data?.overview || undefined,
        language: translation?.english_name || undefined,
      })),
      image: `https://image.tmdb.org/t/p/original${data?.poster_path}`,
      cover: `https://image.tmdb.org/t/p/original${data?.backdrop_path}`,
      logos: data?.images?.logos.map((logo: any) => ({
        url: `https://image.tmdb.org/t/p/original${logo.file_path}`,
        aspectRatio: logo?.aspect_ratio,
        width: logo?.width,
      })),
      type: mediaType === 'movie' ? TvType.MOVIE : TvType.TVSERIES,
      rating: data?.vote_average || 0,
      releaseDate: data?.release_date || data?.first_air_date,
      description: data?.overview,
      genres: data?.genres.map((genre: { name: string }) => genre.name),
      duration: data?.runtime || data?.episode_run_time[0],
      totalEpisodes: data?.number_of_episodes,
      totalSeasons: data?.number_of_seasons as number,
      directors: data?.credits?.crew
        .filter((crew: { job: string }) => crew.job === 'Director')
        .map((crew: { name: string }) => crew.name),
      writers: data?.credits?.crew
        .filter((crew: { job: string }) => crew.job === 'Screenplay')
        .map((crew: { name: string }) => crew.name),
      actors: data?.credits?.cast.map((cast: { name: string }) => cast.name),
      trailer: {
        id: data?.videos?.results[0]?.key,
        site: data?.videos?.results[0]?.site,
        url: `https://www.youtube.com/watch?v=${data?.videos?.results[0]?.key}`,
      },
      mappings: {
        imdb: data?.external_ids?.imdb_id || undefined,
        tmdb: data?.id || undefined,
      },
      similar: data?.similar?.results?.map(this.mapToMovieResult),
      recommendations: data?.recommendations?.results?.map(this.mapToMovieResult),
    };

    if (mediaType === 'movie') {
      info.episodeId = InfoFromProvider?.episodes![0]?.id;
    }

    if (mediaType === 'tv' && info.totalSeasons && info.totalSeasons > 0) {
      info.nextAiringEpisode = data?.next_episode_to_air
        ? {
            season: data.next_episode_to_air?.season_number || undefined,
            episode: data.next_episode_to_air?.episode_number || undefined,
            releaseDate: data.next_episode_to_air?.air_date || undefined,
            title: data.next_episode_to_air?.name || undefined,
            description: data.next_episode_to_air?.overview || undefined,
            runtime: data.next_episode_to_air?.runtime || undefined,
          }
        : undefined;

      info.seasons = await this.fetchSeasons(mediaId, info.totalSeasons, InfoFromProvider?.episodes);
    }

    return info;
  };

  private async fetchSeasons(mediaId: string, totalSeasons: number, providerEpisodes: any[]): Promise<any[]> {
    const seasons = [];
    const fetchPromises = [];

    for (let i = 1; i <= totalSeasons; i++) {
      fetchPromises.push(this.fetchSeason(mediaId, i, providerEpisodes));
    }

    const results = await Promise.all(fetchPromises);
    seasons.push(...results);

    return seasons;
  }

  private async fetchSeason(mediaId: string, seasonNumber: number, providerEpisodes: any[]): Promise<any> {
    const seasonUrl = `${this.apiUrl}/tv/${mediaId}/season/${seasonNumber}?api_key=${this.apiKey}`;
    const seasonData = await this.fetchFromApi(seasonUrl);

    const seasonEpisodes = providerEpisodes?.filter(episode => episode.season === seasonNumber);
    const episodes = seasonData?.episodes?.map((episode: any): IMovieEpisode => {
      const episodeFromProvider = seasonEpisodes?.find(ep => ep.number === episode.episode_number);
      return {
        id: episodeFromProvider?.id,
        title: episode.name,
        episode: episode.episode_number,
        season: episode.season_number,
        releaseDate: episode.air_date,
        description: episode.overview,
        url: episodeFromProvider?.url || undefined,
        img: episode?.still_path
          ? {
              mobile: `https://image.tmdb.org/t/p/w300${episode.still_path}`,
              hd: `https://image.tmdb.org/t/p/w780${episode.still_path}`,
            }
          : undefined,
      };
    });

    return {
      season: seasonNumber,
      image: seasonData?.poster_path
        ? {
            mobile: `https://image.tmdb.org/t/p/w300${seasonData.poster_path}`,
            hd: `https://image.tmdb.org/t/p/w780${seasonData.poster_path}`,
          }
        : undefined,
      episodes,
      isReleased: seasonData?.episodes[0]?.air_date <= new Date().toISOString(),
    };
  }

  private async findIdFromTitle(
    title: string,
    extraData: {
      type: TvType;
      year?: number;
      totalSeasons?: number;
      totalEpisodes?: number;
      [key: string]: any;
    }
  ): Promise<string | undefined> {
    title = title.replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase();
    const findMedia = await this.provider.search(title) as ISearch<IAnimeResult>;
    if (findMedia.results.length === 0) return '';

    findMedia.results.sort((a, b) => {
      const firstTitle = (typeof a.title === 'string' ? a.title : '') ?? '';
      const secondTitle = (typeof b.title === 'string' ? b.title : '') ?? '';
      return compareTwoStrings(title, secondTitle.toLowerCase()) - compareTwoStrings(title, firstTitle.toLowerCase());
    });

    findMedia.results = findMedia.results.filter(result => {
      if (extraData.type === TvType.MOVIE) return result.type === TvType.MOVIE;
      if (extraData.type === TvType.TVSERIES) return result.type === TvType.TVSERIES;
      return true;
    });

    if (extraData.year && extraData.type === TvType.MOVIE) {
      findMedia.results = findMedia.results.filter(result => result.releaseDate?.split('-')[0] === extraData.year?.toString());
    }

    if (extraData.totalSeasons && extraData.type === TvType.TVSERIES) {
      findMedia.results = findMedia.results.filter(result => {
        const totalSeasons = (result.seasons as number) || 0;
        const extraDataSeasons = extraData.totalSeasons as number;
        return totalSeasons >= extraDataSeasons - 2 && totalSeasons <= extraDataSeasons + 2;
      });
    }

    return findMedia?.results[0]?.id;
  }

  override fetchEpisodeSources = async (id: string, ...args: any): Promise<ISource> => {
    return this.provider.fetchEpisodeSources(id, ...args);
  };

  override fetchEpisodeServers = async (episodeId: string, ...args: any): Promise<IEpisodeServer[]> => {
    return this.provider.fetchEpisodeServers(episodeId, ...args);
  };
}

export default TMDB;
