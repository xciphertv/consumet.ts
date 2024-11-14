"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio_1 = require("cheerio");
const extractors_1 = require("../../extractors");
const models_1 = require("../../models");
class DramaCool extends models_1.MovieParser {
    constructor() {
        super(...arguments);
        this.name = 'DramaCool';
        this.baseUrl = 'https://asianc.co';
        this.logo = 'https://play-lh.googleusercontent.com/IaCb2JXII0OV611MQ-wSA8v_SAs9XF6E3TMDiuxGGXo4wp9bI60GtDASIqdERSTO5XU';
        this.classPath = 'MOVIES.DramaCool';
        this.supportedTypes = new Set([models_1.TvType.MOVIE, models_1.TvType.TVSERIES]);
        this.search = async (query, page = 1) => {
            try {
                const searchResult = {
                    currentPage: page,
                    hasNextPage: false,
                    totalPages: page,
                    results: [],
                };
                const { data } = await this.client.get(`${this.baseUrl}/search?keyword=${query.replace(/[\W_]+/g, '-')}&page=${page}`);
                const $ = (0, cheerio_1.load)(data);
                const navSelector = 'ul.pagination';
                const lastPage = $(navSelector).find('li.last a').attr('href');
                if (lastPage) {
                    const maxPage = parseInt(lastPage.split('page=')[1]);
                    searchResult.totalPages = maxPage || 1;
                    searchResult.hasNextPage = page < maxPage;
                }
                $('div.block > div.tab-content > ul.list-episode-item > li').each((_, el) => {
                    const link = $(el).find('a').attr('href');
                    const title = $(el).find('h3.title').text().trim();
                    const image = $(el).find('img').attr('data-original');
                    if (link && title) {
                        searchResult.results.push({
                            id: link.slice(1).replace('.html', ''),
                            title: title,
                            url: `${this.baseUrl}${link}`,
                            image: image,
                        });
                    }
                });
                return searchResult;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchMediaInfo = async (mediaId, type) => {
            var _a, _b;
            try {
                const realMediaId = mediaId;
                const mediaUrl = mediaId.startsWith(this.baseUrl) ? mediaId : `${this.baseUrl}/${mediaId}`;
                const { data } = await this.client.get(mediaUrl);
                const $ = (0, cheerio_1.load)(data);
                // Initialize arrays first
                const genres = [];
                const episodes = [];
                const characters = [];
                // Parse genres first
                $('div.details div.info p:contains("Genre:") a').each((_, el) => {
                    genres.push($(el).text().trim());
                });
                const mediaInfo = {
                    id: realMediaId,
                    title: $('.info > h1:nth-child(1)').text(),
                    otherNames: $('.other_name > a')
                        .map((_, el) => $(el).text().trim())
                        .get(),
                    genres: genres,
                    type: models_1.TvType.TVSERIES,
                    episodes: episodes,
                    characters: characters,
                };
                const duration = $('div.details div.info p:contains("Duration:")').first().text().trim();
                if (duration) {
                    mediaInfo.duration = duration.replace('Duration:', '').trim();
                }
                const status = $('div.details div.info p:contains("Status:")').find('a').first().text().trim();
                switch (status) {
                    case 'Ongoing':
                        mediaInfo.status = models_1.MediaStatus.ONGOING;
                        break;
                    case 'Completed':
                        mediaInfo.status = models_1.MediaStatus.COMPLETED;
                        break;
                    default:
                        mediaInfo.status = models_1.MediaStatus.UNKNOWN;
                }
                mediaInfo.image = $('div.details > div.img > img').attr('src');
                mediaInfo.description = $('div.details div.info p:not(:has(*))')
                    .map((_, el) => $(el).text().trim())
                    .get()
                    .join('\n\n')
                    .trim();
                mediaInfo.releaseDate = this.removeContainsFromString($('div.details div.info p:contains("Released:")').text(), 'Released');
                mediaInfo.contentRating = this.removeContainsFromString($('div.details div.info p:contains("Content Rating:")').text(), 'Content Rating');
                mediaInfo.airsOn = this.removeContainsFromString($('div.details div.info p:contains("Airs On:")').text(), 'Airs On');
                mediaInfo.director = this.removeContainsFromString($('div.details div.info p:contains("Director:")').text(), 'Director');
                mediaInfo.originalNetwork = this.cleanupText(this.removeContainsFromString($('div.details div.info p:contains("Original Network:")').text().trim(), 'Original Network'));
                const trailerIframe = $('div.trailer iframe').attr('src');
                if (trailerIframe) {
                    mediaInfo.trailer = {
                        id: (_b = (_a = trailerIframe.split('embed/')[1]) === null || _a === void 0 ? void 0 : _a.split('?')[0]) !== null && _b !== void 0 ? _b : '',
                        url: trailerIframe,
                    };
                }
                // Parse characters/cast
                $('div.slider-star > div.item').each((_, el) => {
                    const charUrl = $(el).find('a.img').attr('href');
                    const charImage = $(el).find('img').attr('src');
                    const charName = $(el).find('h3.title').text().trim();
                    if (charUrl && charName) {
                        characters.push({
                            name: charName,
                            image: charImage || undefined,
                            url: `${this.baseUrl}${charUrl}`,
                        });
                    }
                });
                // Parse episodes
                $('div.content-left > div.block-tab > div > div > ul > li').each((_, el) => {
                    var _a;
                    const episodeUrl = $(el).find('a').attr('href');
                    const episodeTitle = $(el).find('h3').text().replace(mediaInfo.title.toString(), '').trim();
                    if (episodeUrl) {
                        const episodeId = episodeUrl.split('.html')[0].slice(1);
                        const episodeNumber = (_a = episodeUrl.split('-episode-')[1]) === null || _a === void 0 ? void 0 : _a.split('.html')[0];
                        if (episodeId && episodeNumber) {
                            const episode = {
                                id: episodeId,
                                title: episodeTitle,
                                episode: parseFloat(episodeNumber.split('-').join('.')),
                                url: `${this.baseUrl}${episodeUrl}`,
                                subType: $(el).find('span.type').text() || undefined,
                                releaseDate: $(el).find('span.time').text() || undefined,
                            };
                            episodes.push(episode);
                        }
                    }
                });
                episodes.reverse();
                return mediaInfo;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchEpisodeServers = async (episodeId) => {
            try {
                const episodeServers = [];
                const episodeUrl = episodeId.includes('.html') ? episodeId : `${this.baseUrl}/${episodeId}.html`;
                const { data } = await this.client.get(episodeUrl);
                const $ = (0, cheerio_1.load)(data);
                $('div.anime_muti_link > ul > li').each((_, el) => {
                    var _a, _b;
                    const url = $(el).attr('data-video');
                    let name = (_b = (_a = $(el).attr('class')) === null || _a === void 0 ? void 0 : _a.replace('selected', '').trim()) !== null && _b !== void 0 ? _b : '';
                    if (url) {
                        if (name.includes('Standard')) {
                            name = models_1.StreamingServers.AsianLoad;
                        }
                        const serverUrl = url.startsWith('//') ? `https:${url}` : url;
                        episodeServers.push({
                            name: name,
                            url: serverUrl,
                        });
                    }
                });
                return episodeServers;
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchEpisodeSources = async (episodeId, server = models_1.StreamingServers.AsianLoad) => {
            if (episodeId.startsWith('http')) {
                const serverUrl = new URL(episodeId);
                switch (server) {
                    case models_1.StreamingServers.AsianLoad:
                        return {
                            ...(await new extractors_1.AsianLoad(this.proxyConfig, this.adapter).extract(serverUrl)),
                            download: this.downloadLink(episodeId),
                        };
                    case models_1.StreamingServers.MixDrop:
                        return {
                            sources: await new extractors_1.MixDrop(this.proxyConfig, this.adapter).extract(serverUrl),
                        };
                    case models_1.StreamingServers.StreamTape:
                        return {
                            sources: await new extractors_1.StreamTape(this.proxyConfig, this.adapter).extract(serverUrl),
                        };
                    case models_1.StreamingServers.StreamSB:
                        return {
                            sources: await new extractors_1.StreamSB(this.proxyConfig, this.adapter).extract(serverUrl),
                        };
                    default:
                        throw new Error('Server not supported');
                }
            }
            try {
                const servers = await this.fetchEpisodeServers(episodeId);
                const serverIndex = servers.findIndex(s => s.name.toLowerCase() === server.toLowerCase());
                if (serverIndex === -1) {
                    throw new Error(`Server ${server} not found`);
                }
                const serverUrl = new URL(servers.find(s => s.name.toLowerCase() === server.toLowerCase()).url);
                return await this.fetchEpisodeSources(serverUrl.href, server);
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchPopular = async (page = 1) => {
            try {
                const { data } = await this.client.get(`${this.baseUrl}/most-popular-drama?page=${page}`);
                return this.parseViewPage(data, page);
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchRecentTvShows = async (page = 1) => {
            try {
                const { data } = await this.client.get(`${this.baseUrl}/recently-added?page=${page}`);
                return this.parseViewPage(data, page, true);
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.fetchRecentMovies = async (page = 1) => {
            try {
                const { data } = await this.client.get(`${this.baseUrl}/recently-added-movie?page=${page}`);
                return this.parseViewPage(data, page, false, true);
            }
            catch (err) {
                throw new Error(err.message);
            }
        };
        this.parseViewPage = (data, page, isTvShow = false, isMovie = false) => {
            const $ = (0, cheerio_1.load)(data);
            const results = {
                currentPage: page,
                hasNextPage: false,
                totalPages: 1,
                results: [],
            };
            const navSelector = 'ul.pagination';
            const lastPage = $(navSelector).find('li.last a').attr('href');
            if (lastPage) {
                const maxPage = parseInt(lastPage.split('page=')[1]);
                results.totalPages = maxPage || 1;
                results.hasNextPage = page < maxPage;
            }
            $('ul.list-episode-item > li').each((_, el) => {
                const link = $(el).find('a').attr('href');
                const title = $(el).find('h3.title').text().trim();
                const image = $(el).find('img').attr('data-original');
                const time = $(el).find('span.time').text();
                if (link && title) {
                    let id;
                    let episodeNumber;
                    if (isTvShow) {
                        id = link.split('-episode-')[0].slice(1);
                        const epMatch = $(el)
                            .find('span.ep')
                            .text()
                            .match(/EP (\d+)/);
                        episodeNumber = epMatch ? parseInt(epMatch[1]) : undefined;
                    }
                    else if (isMovie) {
                        id = link.slice(1).replace('.html', '');
                    }
                    else {
                        id = link.slice(1).replace('.html', '');
                    }
                    const result = {
                        id: id,
                        title: title,
                        url: `${this.baseUrl}${link}`,
                        image: image,
                        releaseDate: time,
                        type: isMovie ? models_1.TvType.MOVIE : models_1.TvType.TVSERIES,
                    };
                    if (episodeNumber !== undefined) {
                        result.episodeNumber = episodeNumber;
                    }
                    results.results.push(result);
                }
            });
            return results;
        };
        this.downloadLink = (url) => {
            return url.replace(/^(https:\/\/[^\/]+)\/[^?]+(\?.+)$/, '$1/download$2');
        };
        this.removeContainsFromString = (str, contains) => {
            contains = contains.toLowerCase();
            return str.toLowerCase().replace(/\n/g, '').replace(`${contains}:`, '').trim();
        };
        this.cleanupText = (str) => {
            return str
                .split(';')
                .map(part => part.trim())
                .filter(part => part.length > 0)
                .join('; ');
        };
    }
}
exports.default = DramaCool;
//# sourceMappingURL=dramacool.js.map