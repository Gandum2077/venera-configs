class ShonenJumpPlus extends ComicSource {
  name = "少年ジャンプ＋";
  key = "shonen_jump_plus";
  version = "1.1.2";
  minAppVersion = "1.2.1";
  url =
    "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/shonen_jump_plus.js";

  deviceId = this.generateDeviceId();
  bearerToken = null;
  userAccountId = null;
  tokenExpiry = 0;
  latestVersion = "4.0.24";

  settings = {
    contentApi: {
      title: "内容来源（官网不含 App 限定内容）",
      type: "select",
      default: "web",
      options: [
        { value: "web", text: "官网（推荐）" },
        { value: "app", text: "旧 App 接口（目前认证可能返回 HTTP 403）" },
      ],
    },
    allowPurchases: {
      title: "允许旧 App 接口使用初次免费或点数租借（可能消耗点数）",
      type: "switch",
      default: false,
    },
  };

  get useApp() {
    return this.loadSetting("contentApi") === "app";
  }

  get webHeaders() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Origin": "https://shonenjumpplus.com",
      "Referer": "https://shonenjumpplus.com/",
    };
  }

  parseJSON(response, context) {
    if (response.status !== 200) throw `${context}: HTTP ${response.status}`;
    try {
      const value = JSON.parse(response.body);
      if (value === null || typeof value !== "object") throw "Invalid JSON envelope";
      return value;
    } catch (_) {
      throw `${context}: invalid JSON response`;
    }
  }

  async webGraphql(operationName, variables) {
    const response = await Network.post("https://shonenjumpplus.com/graphql", {
      ...this.webHeaders, "Content-Type": "application/json",
    }, JSON.stringify({ operationName, variables, query: WebQueries[operationName] }));
    const result = this.parseJSON(response, "官网 GraphQL");
    if (result.errors?.length) throw "官网 GraphQL: " + result.errors.map(e => e.message).join("; ");
    if (!result.data) throw "官网 GraphQL: missing data";
    return result.data;
  }

  async webGet(path) {
    const response = await Network.get("https://shonenjumpplus.com" + path, this.webHeaders);
    if (response.status !== 200) throw `官网: HTTP ${response.status}`;
    return response;
  }

  webComic(series) {
    const link = series.firstEpisode?.permalink || series.firstVolume?.permalink;
    const cover = series.thumbnailUri || series.latestVolume?.thumbnailUri;
    if (!series.databaseId || !series.title || !link || !cover) return null;
    return new Comic({ id: "web:" + series.databaseId, title: series.title, cover });
  }

  async webSearch(keyword, page) {
    page = Math.max(1, page || 1);
    // The public search returns its complete result set without a cursor.
    // Slice that set locally; never repeat page one for later page requests.
    if (!this.webSearchCache || this.webSearchCache.keyword !== keyword || page === 1) {
      const result = await this.webGraphql("SearchSeries", { keyword });
      if (!Array.isArray(result.searchSeries?.edges)) throw "官网搜索: missing edges";
      const seen = new Set();
      const comics = result.searchSeries.edges.map(edge => this.webComic(edge.node)).filter(comic => {
        if (!comic || seen.has(comic.id)) return false;
        seen.add(comic.id);
        return true;
      });
      this.webSearchCache = { keyword, comics };
    }
    const comics = this.webSearchCache.comics;
    return { comics: comics.slice((page - 1) * 20, page * 20), maxPage: Math.max(1, Math.ceil(comics.length / 20)) };
  }

  async webCatalog(path, selector, titleSelector, authorSelector) {
    const document = new HtmlDocument((await this.webGet(path)).body);
    try {
      const comics = [], seen = new Set();
      for (const item of document.querySelectorAll(selector)) {
        const href = item.querySelector("a")?.attributes.href || "";
        const product = href.match(/\/(episode|volume)\/(\d+)(?:[?#]|$)/);
        const image = item.querySelector("img")?.attributes || {};
        const cover = image["data-src"] || image.src || "";
        const title = item.querySelector(titleSelector)?.text.trim();
        if (!product || !cover || !title) continue;
        // Scissors CDN embeds the original thumbnail URL in its final segment.
        let original = cover;
        try { original = decodeURIComponent(cover); } catch (_) { /* retain original URL */ }
        const seriesId = original.match(/\/series-[^/]+\/(\d+)-/);
        const id = seriesId ? "web:" + seriesId[1] : `web:${product[1]}:${product[2]}`;
        if (seen.has(id)) continue;
        seen.add(id);
        comics.push(new Comic({ id, title, cover, tags: [], description: item.querySelector(authorSelector)?.text.trim() || "" }));
      }
      if (!comics.length) throw "官网目录: no series found";
      return comics;
    } finally { document.dispose(); }
  }

  async webExplore() {
    return {
      "総合ランキング": await this.webCatalog("/", ".total-ranking-list-pc li", ".total-ranking-item-title-pc", ".total-ranking-item-author-pc"),
      "連載作品": await this.webCatalog("/series", ".series-list-item", ".series-list-title", ".series-list-author"),
    };
  }

  async webSeriesId(id) {
    const value = String(id).slice(4);
    if (/^\d+$/.test(value)) return value;
    const product = value.match(/^(episode|volume):(\d+)$/);
    if (!product) throw "Invalid website comic ID";
    const document = new HtmlDocument((await this.webGet(`/${product[1]}/${product[2]}`)).body);
    try {
      const seriesId = document.querySelector("script.js-valve")?.attributes["data-giga_series"];
      if (!seriesId || !/^\d+$/.test(seriesId)) throw "官网: missing series ID";
      return seriesId;
    } finally { document.dispose(); }
  }

  async webProducts(seriesId, type, count) {
    if (!Number.isInteger(count) || count < 0) throw "官网目录: invalid totalCount";
    const products = [], seen = new Set();
    while (products.length < count) {
      const response = await this.webGet(`/api/viewer/pagination_readable_products?type=${type}&aggregate_id=${seriesId}&sort_order=desc&offset=${products.length}`);
      const batch = this.parseJSON(response, "官网目录");
      if (!Array.isArray(batch) || !batch.length) throw "官网目录: incomplete chapter list";
      for (const product of batch) {
        if (!product.readable_product_id || !product.title || seen.has(product.readable_product_id))
          throw "官网目录: invalid or repeated chapter";
        seen.add(product.readable_product_id);
        products.push(product);
      }
    }
    return products.reverse();
  }

  async webLoadInfo(id) {
    const seriesId = await this.webSeriesId(id);
    const data = await this.webGraphql("SeriesDetails", { id: seriesId });
    const series = data.series;
    if (!series?.title) throw "官网: series not found";
    const chapters = {};
    for (const type of ["episode", "volume"]) {
      const products = await this.webProducts(seriesId, type, series[type === "episode" ? "episodes" : "volumes"]?.totalCount);
      for (const product of products) {
        const state = product.purchase_info;
        const marker = state?.unavailable ? "⛔ " : state?.can_read === false ? "🔒 " : "";
        chapters[`web:${type}:${product.readable_product_id}`] = marker + product.title;
      }
    }
    if (!Object.keys(chapters).length) throw "官网: no chapters found";
    const authors = (series.author?.name || "").split(/\s*\/\s*/).filter(Boolean);
    return new ComicDetails({ title: series.title, subtitle: authors.join(" / "),
      cover: series.thumbnailUri || series.latestVolume?.thumbnailUri || "",
      description: series.description || "", tags: { Author: authors }, chapters,
      url: series.firstEpisode?.permalink || series.firstVolume?.permalink,
    });
  }

  async webLoadEp(epId) {
    const match = String(epId).match(/^web:(episode|volume):(\d+)$/);
    if (!match) throw "Invalid website chapter ID";
    const document = new HtmlDocument((await this.webGet(`/${match[1]}/${match[2]}`)).body);
    try {
      const raw = document.querySelector("script#episode-json")?.attributes["data-value"];
      if (!raw) throw "官网: missing viewer data";
      const product = this.parseJSON({ status: 200, body: raw }, "官网阅读数据").readableProduct;
      const structure = product?.pageStructure;
      if (!structure || !Array.isArray(structure.pages)) throw "章节不可用或需要购买，请在官网确认访问权限";
      if (structure.choJuGiga && structure.choJuGiga !== "baku") throw "官网: unsupported image scrambling";
      const images = structure.pages.filter(page => page.type === "main" && page.src).map(page =>
        page.src + (structure.choJuGiga === "baku" ? "#venera-baku" : ""));
      if (!images.length) throw "章节不可用或需要购买，请在官网确认访问权限";
      return { images };
    } finally { document.dispose(); }
  }

  get headers() {
    return {
      "Origin": "https://shonenjumpplus.com",
      "Referer": "https://shonenjumpplus.com/",
      "X-Giga-Device-Id": this.deviceId,
      "User-Agent": `ShonenJumpPlus-Android/${this.latestVersion}`,
    };
  }

  apiBase = `https://shonenjumpplus.com/api/v1`;
  generateDeviceId() {
    let result = "";
    const chars = "0123456789abcdef";
    for (let i = 0; i < 16; i++) {
      result += chars[randomInt(0, chars.length - 1)];
    }
    return result;
  }

  async init() {
    if (!this.useApp) return;
    const url = "https://apps.apple.com/jp/app/id875750302";

    let resp;
    try { resp = await Network.get(url); } catch (_) { return; }
    if (resp.status !== 200) return;

    const match = resp.body.match(/whats-new__latest__version">[^<]*?([\d.]+)</);

    if (match && match[1]) {
      this.latestVersion = match[1];
    }
  }

  explore = [
    {
      title: "少年ジャンプ＋",
      type: "singlePageWithMultiPart",
      load: async () => {
        if (!this.useApp) return this.webExplore();
        await this.ensureAuth();

        const response = await this.graphqlRequest("HomeCacheable", {});

        if (!response || !response.data || !response.data.homeSections) {
          throw "Cannot fetch home sections";
        }

        const sections = response.data.homeSections;
        const dailyRankingSection = sections.find((section) =>
          section.__typename === "DailyRankingSection"
        );

        if (!dailyRankingSection || !dailyRankingSection.dailyRankings) {
          throw "Cannot fetch daily ranking data";
        }

        const dailyRanking = dailyRankingSection.dailyRankings.find((ranking) =>
          ranking.ranking && ranking.ranking.__typename === "DailyRanking"
        );

        if (
          !dailyRanking || !dailyRanking.ranking ||
          !dailyRanking.ranking.items || !dailyRanking.ranking.items.edges
        ) {
          throw "Cannot fetch ranking data structure";
        }

        const rankingItems = dailyRanking.ranking.items.edges.map((edge) =>
          edge.node
        ).filter((node) =>
          node.__typename === "DailyRankingValidItem" && node.product
        );

        function parseComic(item) {
          const series = item.product.series;
          if (!series) return null;

          const cover = series.squareThumbnailUriTemplate ||
            series.horizontalThumbnailUriTemplate;

          return {
            id: series.databaseId,
            title: series.title || "",
            cover: cover
              ? cover.replace("{height}", "500").replace("{width}", "500")
              : "",
            tags: [],
            description: `Ranking: ${item.rank} · Views: ${
              item.viewCount || "Unknown"
            }`,
          };
        }

        const comics = rankingItems.map(parseComic).filter((comic) =>
          comic !== null
        );

        const result = {};
        result["Daily Ranking"] = comics;
        return result;
      },
    },
  ];

  search = {
    load: async (keyword, _, page) => {
      if (!this.useApp) return this.webSearch(keyword, page);
      page = Math.max(1, page || 1);
      if (!this.appSearchCursors || this.appSearchCursors.keyword !== keyword || page === 1)
        this.appSearchCursors = { keyword, cursors: { 1: null } };
      if (!Object.prototype.hasOwnProperty.call(this.appSearchCursors.cursors, page)) {
        // Venera passes a page number; obtain the preceding server cursor if
        // the user opens a page before it has been visited in this session.
        await this.search.load(keyword, _, page - 1);
      }
      if (!Object.prototype.hasOwnProperty.call(this.appSearchCursors.cursors, page))
        return { comics: [], maxPage: page - 1 };
      if (!this.bearerToken || Date.now() > this.tokenExpiry) {
        await this.fetchBearerToken();
      }

      const operationName = "SearchResult";

      const response = await this.graphqlRequest(operationName, {
        keyword,
        after: this.appSearchCursors.cursors[page],
      });
      const edges = response?.data?.search?.edges || [];
      const pageInfo = response?.data?.search?.pageInfo || {};
      if (!Array.isArray(response?.data?.search?.edges)) throw "App search: missing edges";
      if (pageInfo.hasNextPage) {
        if (!pageInfo.endCursor || pageInfo.endCursor === this.appSearchCursors.cursors[page]) throw "App search: missing or repeated cursor";
        this.appSearchCursors.cursors[page + 1] = pageInfo.endCursor;
      }

      const comics = edges.map(({ node }) => {
        const authors = (node.author?.name || "").split(/\s*\/\s*/).filter(
          Boolean,
        );
        const cover = node.latestIssue?.thumbnailUriTemplate ||
          node.thumbnailUriTemplate;
        if (node.__typename === "Series") {
          return new Comic({
            id: node.databaseId,
            title: node.title || "",
            cover: this.replaceCoverUrl(cover),
            description: node.description || "",
            tags: authors,
          });
        }
        if (node.__typename === "MagazineLabel") {
          return new Comic({
            id: node.databaseId,
            title: node.title || "",
            cover: this.replaceCoverUrl(cover),
          });
        }
        return null;
      }).filter(Boolean);

      return {
        comics,
        maxPage: pageInfo.hasNextPage ? (page || 1) + 1 : (page || 1),
        endCursor: pageInfo.endCursor,
      };
    },
  };

  comic = {
    loadInfo: async (id) => {
      // Prefix web IDs so old App bookmarks retain their original identity.
      if (String(id).startsWith("web:")) return this.webLoadInfo(id);
      await this.ensureAuth();
      const seriesData = await this.fetchSeriesDetail(id);
      const episodes = await this.fetchEpisodes(id);

      const { chapters, latestPublishAt } = episodes.reduce(
        (acc, ep) => ({
          chapters: {
            ...acc.chapters,
            [ep.databaseId]: ep.title || "",
          },
          latestPublishAt:
            ep.publishedAt && ep.publishedAt > acc.latestPublishAt
              ? ep.publishedAt
              : acc.latestPublishAt,
        }),
        { chapters: {}, latestPublishAt: "" },
      );

      const maxDate = latestPublishAt > seriesData.openAt
        ? latestPublishAt
        : seriesData.openAt;
      const updateDate = new Date(new Date(maxDate) - 60 * 60 * 1000);
      const authors = (seriesData.author?.name || "").split(/\s*\/\s*/).filter(
        Boolean,
      );

      return new ComicDetails({
        title: seriesData.title || "",
        subtitle: authors.join(" / "),
        cover: this.replaceCoverUrl(seriesData.thumbnailUriTemplate),
        description: seriesData.description || "",
        tags: {
          "Author": authors,
          "Update": [updateDate.toISOString().slice(0, 10)],
        },
        url: `https://shonenjumpplus.com/app/episode/${seriesData.publisherId}`,
        chapters,
      });
    },

    loadEp: async (comicId, epId) => {
      if (String(epId).startsWith("web:")) return this.webLoadEp(epId);
      await this.ensureAuth();
      const episodeId = this.normalizeEpisodeId(epId);
      const episodeData = await this.fetchEpisodePages(episodeId);

      if (!this.isEpisodeAccessible(episodeData)) {
        await this.handleEpisodePurchase(episodeData);
        const refreshed = await this.fetchEpisodePages(episodeId);
        if (!this.isEpisodeAccessible(refreshed)) throw "章节仍不可用或需要购买";
        return this.buildImageUrls(refreshed);
      }

      return this.buildImageUrls(episodeData);
    },

    onImageLoad: (url) => {
      if (url.endsWith("#venera-baku")) return {
        url: url.slice(0, -"#venera-baku".length), headers: this.webHeaders,
        modifyImage: `function modifyImage(image) {
          const result = Image.empty(image.width, image.height);
          result.fillImageAt(0, 0, image);
          const width = Math.floor(image.width / 32) * 8;
          const height = Math.floor(image.height / 32) * 8;
          for (let index = 0; index < 16; index++) {
            const column = index % 4, row = Math.floor(index / 4);
            if (width && height) result.fillImageRangeAt(row * width, column * height,
              image, column * width, row * height, width, height);
          }
          return result;
        }`,
      };
      const tokenIndex = url.lastIndexOf("#venera-app-token=");
      if (tokenIndex < 0) return { url, headers: this.webHeaders };
      const cleanUrl = url.slice(0, tokenIndex), token = decodeURIComponent(url.slice(tokenIndex + "#venera-app-token=".length));
      return {
        url: cleanUrl,
        headers: { "X-Giga-Page-Image-Auth": token },
      };
    },

    onClickTag: (namespace, tag) => {
      if (namespace === "Author") {
        return {
          action: "search",
          keyword: `${tag}`,
          param: null,
        };
      }
      return null;
    },
  };

  async ensureAuth() {
    if (!this.bearerToken || Date.now() > this.tokenExpiry) {
      await this.fetchBearerToken();
    }
  }

  async graphqlRequest(operationName, variables) {
    const payload = {
      operationName,
      variables,
      query: GraphQLQueries[operationName],
    };
    const response = await Network.post(
      `${this.apiBase}/graphql?opname=${operationName}`,
      {
        ...this.headers,
        "Authorization": `Bearer ${this.bearerToken}`,
        "Accept": "application/json",
        "X-APOLLO-OPERATION-NAME": operationName,
        "Content-Type": "application/json",
      },
      JSON.stringify(payload),
    );

    const result = this.parseJSON(response, "App GraphQL");
    if (result.errors?.length) throw "App GraphQL: " + result.errors.map(e => [e.message, e.extensions?.code].filter(Boolean).join(" (") + (e.extensions?.code ? ")" : "")).join("; ");
    if (!result.data) throw "App GraphQL: missing data";
    return result;
  }

  normalizeEpisodeId(epId) {
    if (typeof epId === "object") return epId.id;
    if (typeof epId === "string" && epId.includes("/")) {
      return epId.split("/").pop();
    }
    return epId;
  }

  replaceCoverUrl(url) {
    return (url || "").replace("{height}", "1500").replace(
      "{width}",
      "1500",
    ) || "";
  }

  async fetchBearerToken() {
    const response = await Network.post(
      `${this.apiBase}/user_account/access_token`,
      this.headers,
      "",
    );
    const { access_token, user_account_id } = this.parseJSON(response, "App 认证");
    if (!access_token) throw "App 认证: missing access token";
    this.bearerToken = access_token;
    this.userAccountId = user_account_id;
    this.tokenExpiry = Date.now() + 3600000;
  }

  async fetchSeriesDetail(id) {
    const response = await this.graphqlRequest("SeriesDetail", { id });
    return response?.data?.series || {};
  }

  async fetchEpisodes(id) {
    const response = await this.graphqlRequest(
      "SeriesDetailEpisodeList",
      { id, episodeOffset: 0, episodeFirst: 1500, episodeSort: "NUMBER_ASC" },
    );
    const episodes = (response?.data?.series?.episodes?.edges || []).map(
      (edge) => edge.node
    );
    return episodes;
  }

  async fetchEpisodePages(episodeId) {
    const response = await this.graphqlRequest(
      "EpisodeViewerConditionallyCacheable",
      { episodeID: episodeId },
    );
    return response?.data?.episode || {};
  }

  isEpisodeAccessible({ purchaseInfo }) {
    return purchaseInfo?.isFree || purchaseInfo?.hasPurchased ||
      purchaseInfo?.hasRented;
  }

  async handleEpisodePurchase(episodeData) {
    if (!this.loadSetting("allowPurchases")) throw "章节需要初次免费或点数租借；默认不自动消费，请在官网确认访问权限";
    const { id, purchaseInfo } = episodeData;
    const { purchasableViaOnetimeFree, rentable, unitPrice } = purchaseInfo ||
      {};

    if (purchasableViaOnetimeFree) {
      if (!await this.consumeOnetimeFree(id)) throw "Failed to use one-time free reading";
    } else if (rentable) await this.rentChapter(id, unitPrice);
    else throw "章节不可用或需要购买";
  }

  buildImageUrls({ pageImages, pageImageToken }) {
    if (!Array.isArray(pageImages?.edges) || !pageImageToken) throw "App: missing page images or authorization";
    const validImages = pageImages.edges.flatMap((edge) => edge.node?.src)
      .filter(Boolean);
    if (!validImages.length) throw "App: no page images";
    return {
      images: validImages.map((url) => `${url}#venera-app-token=${encodeURIComponent(pageImageToken)}`),
    };
  }

  async consumeOnetimeFree(episodeId) {
    const response = await this.graphqlRequest("ConsumeOnetimeFree", {
      input: { id: episodeId },
    });
    return response?.data?.consumeOnetimeFree?.isSuccess;
  }

  async rentChapter(episodeId, unitPrice) {
    const response = await this.graphqlRequest("Rent", {
      input: { id: episodeId, unitPrice },
    });

    if (!response?.data?.rent?.userAccount?.databaseId) throw "App: rental did not succeed";
    this.userAccountId = response?.data?.rent?.userAccount?.databaseId;
    return true;
  }

  async refreshAccount() {
    this.deviceId = this.generateDeviceId();
    this.bearerToken = this.userAccountId = null;
    this.tokenExpiry = 0;
    await this.fetchBearerToken();
    await this.addUserDevice();
  }

  async addUserDevice() {
    await this.graphqlRequest("AddUserDevice", {
      input: {
        deviceName: `Android ${21 + Math.floor(Math.random() * 14)}`,
        modelName: `Device-${Math.random().toString(36).slice(2, 10)}`,
        osName: `Android ${9 + Math.floor(Math.random() * 6)}`,
      },
    });
    this.addUserDeviceCalled = true;
  }
}

// Public wire fields confirmed against the official website; see the repair evidence.
const WebQueries = {
  SearchSeries: `query SearchSeries($keyword: String!) {
    searchSeries(keyword: $keyword) { edges { node {
      databaseId title thumbnailUri firstEpisode { permalink }
      firstVolume { permalink } latestVolume { thumbnailUri }
    } } }
  }`,
  SeriesDetails: `query SeriesDetails($id: String!) {
    series(databaseId: $id) {
      databaseId title author { name } description thumbnailUri
      firstEpisode { permalink } firstVolume { permalink } latestVolume { thumbnailUri }
      episodes: readableProducts(types: [EPISODE], first: 0) { totalCount }
      volumes: readableProducts(types: [VOLUME], first: 0) { totalCount }
    }
  }`,
};

const GraphQLQueries = {
  "SearchResult": `query SearchResult($after: String, $keyword: String!) {
        search(after: $after, first: 50, keyword: $keyword, types: [SERIES,MAGAZINE_LABEL]) {
            pageInfo { hasNextPage endCursor }
            edges {
                node {
                    __typename
                    ... on Series { id databaseId title thumbnailUriTemplate author { name } description }
                    ... on MagazineLabel { id databaseId title thumbnailUriTemplate latestIssue { thumbnailUriTemplate } }
                }
            }
        }
    }`,
  "SeriesDetail": `query SeriesDetail($id: String!) {
        series(databaseId: $id) {
            id databaseId title thumbnailUriTemplate
            author { name }
            description
            hashtags serialUpdateScheduleLabel
            openAt
            publisherId
        }
    }`,
  "SeriesDetailEpisodeList":
    `query SeriesDetailEpisodeList($id: String!, $episodeOffset: Int, $episodeFirst: Int, $episodeSort: ReadableProductSorting) {
        series(databaseId: $id) {
            episodes: readableProducts(types: [EPISODE], first: $episodeFirst, offset: $episodeOffset, sort: $episodeSort) {
                edges { node { databaseId title publishedAt } }
            }
        }
    }`,
  "EpisodeViewerConditionallyCacheable":
    `query EpisodeViewerConditionallyCacheable($episodeID: String!) {
        episode(databaseId: $episodeID) {
            id pageImages { edges { node { src } } } pageImageToken
            purchaseInfo {
                isFree hasPurchased hasRented
                purchasableViaOnetimeFree rentable unitPrice
            }
        }
    }`,
  "ConsumeOnetimeFree":
    `mutation ConsumeOnetimeFree($input: ConsumeOnetimeFreeInput!) {
        consumeOnetimeFree(input: $input) { isSuccess }
    }`,
  "Rent": `mutation Rent($input: RentInput!) {
        rent(input: $input) {
            userAccount { databaseId }
        }
    }`,
  "AddUserDevice": `mutation AddUserDevice($input: AddUserDeviceInput!) {
        addUserDevice(input: $input) { isSuccess }
    }`,
  "HomeCacheable": `query HomeCacheable {
    homeSections {
      __typename
      ...DailyRankingSection
    }
  }
  fragment DesignSectionImage on DesignSectionImage {
    imageUrl width height
  }
  fragment SerialInfoIcon on SerialInfo {
    isOriginal isIndies
  }
  fragment DailyRankingSeries on Series {
    id databaseId publisherId title
    horizontalThumbnailUriTemplate: subThumbnailUri(type: HORIZONTAL_WITH_LOGO)
    squareThumbnailUriTemplate: subThumbnailUri(type: SQUARE_WITHOUT_LOGO)
    isNewOngoing supportsOnetimeFree
    serialInfo {
      __typename ...SerialInfoIcon
      status isTrial
    }
    jamEpisodeWorkType
  }
  fragment DailyRankingItem on DailyRankingItem {
    __typename
    ... on DailyRankingValidItem {
      product {
        __typename
        ... on Episode {
          id databaseId publisherId commentCount
          series {
            __typename ...DailyRankingSeries
          }
        }
        ... on SpecialContent {
          publisherId linkUrl
          series {
            __typename ...DailyRankingSeries
          }
        }
      }
      badge { name label }
      label rank viewCount
    }
    ... on DailyRankingInvalidItem {
      publisherWorkId
    }
  }
  fragment DailyRanking on DailyRanking {
    date firstPositionSeriesId
    items {
      edges {
        node {
          __typename ...DailyRankingItem
        }
      }
    }
  }
  fragment DailyRankingSection on DailyRankingSection {
    title
    titleImage {
      __typename ...DesignSectionImage
    }
    dailyRankings {
      ranking {
        __typename ...DailyRanking
      }
    }
  }`,
};
