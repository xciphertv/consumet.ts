import { IEpisodeServer, IMovieInfo, IMovieResult, ISearch, ISource, MovieParser, StreamingServers, TvType } from '../../models';
declare class DramaCool extends MovieParser {
    readonly name = "DramaCool";
    protected baseUrl: string;
    protected logo: string;
    protected classPath: string;
    supportedTypes: Set<TvType>;
    search: (query: string, page?: number) => Promise<ISearch<IMovieResult>>;
    fetchMediaInfo: (mediaId: string, type?: string) => Promise<IMovieInfo>;
    fetchEpisodeServers: (episodeId: string) => Promise<IEpisodeServer[]>;
    fetchEpisodeSources: (episodeId: string, server?: StreamingServers) => Promise<ISource>;
    fetchPopular: (page?: number) => Promise<ISearch<IMovieResult>>;
    fetchRecentTvShows: (page?: number) => Promise<ISearch<IMovieResult>>;
    fetchRecentMovies: (page?: number) => Promise<ISearch<IMovieResult>>;
    private parseViewPage;
    private downloadLink;
    private removeContainsFromString;
    private cleanupText;
}
export default DramaCool;
