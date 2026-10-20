/** @type {import('./_venera_.js')} */
class ManWaBa extends ComicSource {
  // Note: The fields which are marked as [Optional] should be removed if not used

  // name of the source
  name = "漫蛙吧";

  // unique id of the source
  key = "manwaba";

  version = "1.0.5";

  minAppVersion = "1.4.0";

  // update url
  url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/manwaba.js";

  api = "https://manwaxu.cc/api";

  init() {
    /**
     * Sends an HTTP request.
     * @param {string} url - The URL to send the request to.
     * @param {string} method - The HTTP method (e.g., GET, POST, PUT, PATCH, DELETE).
     * @param {Object} params - The query parameters to include in the request.
     * @param {Object} headers - The headers to include in the request.
     * @param {string} payload - The payload to include in the request.
     * @returns {Promise<Object>} The response from the request.
     */
    this.fetchJson = async (
      url,
      { method = "GET", params, headers, payload }
    ) => {
      if (params) {
        let params_str = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
          .join("&");
        url += `?${params_str}`;
      }
      let res = await Network.sendRequest(method, url, {
        "Content-Type": "application/json",
        ...headers,
      }, payload);
      if (res.status !== 200) {
        throw `Invalid status code: ${res.status}, body: ${res.body}`;
      }
      let json = JSON.parse(res.body);
      if (json.code !== 200) throw new Error(json.msg || "API request failed");
      return json;
    };
    this.logger = {
      error: (msg) => {
        log("error", this.name, msg);
      },
      info: (msg) => {
        log("info", this.name, msg);
      },
      warn: (msg) => {
        log("warning", this.name, msg);
      },
    };
  }

  // The site stores its bearer token after the username/password login.
  userRequest = async (path, { method = "GET", params, payload, form = false, login = false } = {}) => {
    const headers = { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" };
    if (!login) {
      const token = this.loadData("authToken");
      if (typeof token !== "string" || !token) throw new Error("Login expired");
      headers.Authorization = `Bearer ${token}`;
    }
    const query = params ? "?" + Object.keys(params).map((key) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join("&") : "";
    const res = await Network.sendRequest(method, `${this.api}/user/${path}${query}`, headers, payload,
      { maskDataInLog: true });
    if (res.status === 401) throw new Error("Login expired");
    if (res.status !== 200) throw new Error(`Account request failed (HTTP ${res.status})`);
    let json;
    try { json = JSON.parse(res.body); }
    catch (_) { throw new Error("Invalid account API response"); }
    if (json.code === 401) throw new Error("Login expired");
    // Never echo account response bodies, credentials or tokens into logs.
    if (json.code !== 200) throw new Error(`Account request failed (code ${json.code})`);
    return json.data;
  };

  account = {
    login: async (username, password) => {
      const data = await this.userRequest("login", {
        method: "POST", login: true, payload: JSON.stringify({ username, password }),
      });
      if (!data || typeof data.token !== "string" || !data.token.trim() ||
          data.userId == null || String(data.userId) === "0" || String(data.userId) === "") {
        throw new Error("Login failed: missing account session");
      }
      this.saveData("authToken", data.token);
      return "ok";
    },
    logout: () => {
      this.deleteData("authToken");
      this.deleteData("account");
    },
  };

  favoriteId = (id) => {
    const value = String(id);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error("Invalid comic or folder ID");
    }
    return String(Number(value));
  };

  favoriteStatus = async (comicId) => {
    const data = await this.userRequest("favorite/check", { params: { comic_id: this.favoriteId(comicId) } });
    if (typeof data !== "boolean") throw new Error("Invalid favorite status");
    return data;
  };

  favorites = {
    multiFolder: true,
    singleFolderForSingleComic: true,
    loadFolders: async (comicId) => {
      const data = await this.userRequest("favorites/categories");
      const list = Array.isArray(data) ? data : (data?.list ?? data?.List);
      if (!Array.isArray(list)) throw new Error("Invalid bookshelf folders");
      const folders = { "0": "未分类" };
      for (const item of list) {
        const id = this.favoriteId(item.id ?? item.Id);
        const name = item.name ?? item.Name;
        if (id === "0" || typeof name !== "string" || !name) throw new Error("Invalid bookshelf folder");
        folders[id] = name;
      }
      const favorited = [];
      if (comicId != null && await this.favoriteStatus(comicId)) {
        // The public check API returns only a boolean. Resolve membership using
        // the same categoryId filter as the website, without guessing a field.
        const id = this.favoriteId(comicId);
        for (const folder of Object.keys(folders)) {
          let page = 1, result;
          do {
            result = await this.favorites.loadComics(page, folder);
            if (result.comics.some((comic) => comic.id === id)) {
              favorited.push(folder);
              break;
            }
            page++;
          } while (page <= result.maxPage);
          if (favorited.length) break;
        }
        if (!favorited.length) throw new Error("Favorite folder not found; refresh bookshelf");
      }
      return { folders, favorited };
    },
    loadComics: async (page, folder) => {
      if (!Number.isInteger(page) || page < 1) throw new Error("Invalid bookshelf page");
      const params = { page, page_size: 36, status: "all", sort_by: "update_time", sort_order: "desc" };
      if (folder != null) params.categoryId = this.favoriteId(folder);
      const data = await this.userRequest("favorites", { params });
      if (!data || !Array.isArray(data.list) || !Number.isInteger(data.total_page) || data.total_page < 0) {
        throw new Error("Invalid bookshelf response");
      }
      const comics = data.list.map((item) => {
        const id = this.favoriteId(item.comic_id);
        if (!item.title || !item.cover) throw new Error("Invalid bookshelf comic");
        return new Comic({ id, title: item.title, cover: item.cover,
          subTitle: item.latest_chapter || "", description: item.read_chapter || "未读" });
      });
      return { comics, maxPage: Math.max(1, data.total_page) };
    },
    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      if (typeof isAdding !== "boolean") throw new Error("Invalid favorite operation");
      const id = this.favoriteId(comicId);
      const folder = this.favoriteId(folderId ?? "0");
      if (!isAdding) {
        // Deletion is global on the website; a stale folder must not remove a
        // comic that has since been moved to another category.
        const { favorited } = await this.favorites.loadFolders(id);
        if (!favorited.includes(folder)) return true;
      }
      await this.userRequest(`favorite/${isAdding ? "add" : "delete"}`, {
        method: "POST", form: true,
        payload: `comic_id=${id}` + (isAdding ? `&category_id=${folder}` : ""),
      });
      return true;
    },
    addFolder: async (name) => {
      if (typeof name !== "string" || !name.trim()) throw new Error("Folder name is required");
      await this.userRequest("favorites/categories", { method: "POST", payload: JSON.stringify({ name: name.trim() }) });
      return true;
    },
    deleteFolder: async (folderId) => {
      const id = this.favoriteId(folderId);
      if (id === "0") throw new Error("不能删除未分类文件夹");
      // The site's DELETE moves the contained comics into 未分类.
      await this.userRequest(`favorites/categories/${id}`, { method: "DELETE" });
      return true;
    },
  };

  // explore page list
  explore = [
    {
      // title of the page.
      // title is used to identify the page, it should be unique
      title: this.name,

      /// multiPartPage or multiPageComicList or mixed
      type: "singlePageWithMultiPart",

      /**
       * load function
       * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
       * @returns {{}}
       * - for `multiPartPage` type, return [{title: string, comics: Comic[], viewMore: PageJumpTarget}]
       * - for `multiPageComicList` type, for each page(1-based), return {comics: Comic[], maxPage: number}
       * - for `mixed` type, use param `page` as index. for each index(0-based), return {data: [], maxPage: number?}, data is an array contains Comic[] or {title: string, comics: Comic[], viewMore: string?}
       */
      load: async (page) => {
        let params = {
          page: 1,
          pageSize: 6,
          type: "",
          flag: false,
        };
        const url = `${this.api}/home`;
        const data = await this.fetchJson(url, { params }).then(
          (res) => res.data
        );
        let magnaList = {
          热门: data.comicList,
          最新完整版: data.gufengList,
          最新更新: data.xuanhuanList,
          热门收藏: data.xiaoyuanList,
        };
        function parseComic(comic) {
          return new Comic({
            id: comic.id.toString(),
            title: comic.title,
            subTitle: comic.author,
            cover: comic.pic,
            tags: comic.tags.split(","),
          });
        }
        let result = {};
        for (let key in magnaList) {
          result[key] = magnaList[key].map(parseComic);
        }
        return result;
      },
    },
  ];

  // categories
  category = {
    /// title of the category page, used to identify the page, it should be unique
    title: this.name,
    parts: [
      {
        // title of the part
        name: "类型",

        // fixed or random or dynamic
        // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
        // if dynamic, need to provide `loader` field, which indicates the function to load comics
        type: "fixed",

        // Remove this if type is dynamic
        categories: [
          "全部",
          "热血",
          "玄幻",
          "恋爱",
          "冒险",
          "古风",
          "都市",
          "穿越",
          "奇幻",
          "其他",
          "搞笑",
          "少男",
          "战斗",
          "重生",
          "逆袭",
          "爆笑",
          "少年",
          "后宫",
          "系统",
          "BL",
          "韩漫",
          "完整版",
          "19r",
          "台版",
        ],

        itemType: "category",
        categoryParams: [
          "",
          "热血",
          "玄幻",
          "恋爱",
          "冒险",
          "古风",
          "都市",
          "穿越",
          "奇幻",
          "其他",
          "搞笑",
          "少男",
          "战斗",
          "重生",
          "逆袭",
          "爆笑",
          "少年",
          "后宫",
          "系统",
          "BL",
          "韩漫",
          "完整版",
          "19r",
          "台版",
        ],
      },
    ],
    // enable ranking page
    enableRankingPage: false,
  };

  /// category comic loading related
  categoryComics = {
    /**
     * load comics of a category
     * @param category {string} - category name
     * @param param {string?} - category param
     * @param options {string[]} - options from optionList
     * @param page {number} - page number
     * @returns {Promise<{comics: Comic[], maxPage: number}>}
     */
    load: async (category, param, options, page) => {
      let pathMap = {
        "": "/cate",
        "热血": "/cate/hotblooded",
        "玄幻": "/cate/xuanhuan",
        "恋爱": "/cate/romance",
        "冒险": "/cate/adventure",
        "古风": "/cate/historical",
        "都市": "/cate/urban",
        "穿越": "/cate/transmigration",
        "奇幻": "/cate/fantasy",
        "搞笑": "/cate/comedy",
        "少男": "/cate/shounen",
        "战斗": "/cate/action",
        "重生": "/cate/rebirth",
        "逆袭": "/cate/counterattack",
        "爆笑": "/cate/hilarious",
        "少年": "/cate/youth",
        "系统": "/cate/system",
        "BL": "/cate/bl",
        "韩漫": "/cate/manhwa",
        "完整版": "/cate/fullversion",
        "19r": "/cate/19plus",
        "台版": "/cate/taiwanver",
      };
      let url = this.api + (pathMap[param] || "/cate");
      let payload = JSON.stringify({
        page: {
          page: page,
          pageSize: 10,
        },
        category: "comic",
        sort: parseInt(options[2]),
        comic: {
          status: parseInt(options[0] == "2" ? -1 : options[0]),
          day: parseInt(options[1]),
          tag: param,
        },
        video: {
          year: 0,
          typeId: 0,
          typeId1: 0,
          area: "",
          lang: "",
          status: -1,
          day: 0,
        },
        novel: {
          status: -1,
          day: 0,
          sortId: 0,
        },
      });

      let data = await this.fetchJson(url, {
        method: "POST",
        payload,
      }).then((res) => res.data);

      function parseComic(comic) {
        return new Comic({
          id: comic.url.split("/").pop(),
          title: comic.title,
          subTitle: comic.author,
          cover: comic.pic,
          tags: comic.tags.split(","),
          description: comic.intro,
          status: comic.status == 0 ? "连载中" : "已完结",
        });
      }
      return {
        comics: data.list.map(parseComic),
        maxPage: Math.ceil(data.total / 10),
      };
    },
    // provide options for category comic loading
    optionList: [
      {
        options: ["2-全部", "0-连载中", "1-已完结"],
      },
      {
        options: [
          "0-全部",
          "1-周一",
          "2-周二",
          "3-周三",
          "4-周四",
          "5-周五",
          "6-周六",
          "7-周日",
        ],
      },
      {
        options: ["0-更新", "1-新作", "2-畅销", "3-热门", "4-收藏"],
      },
    ],
  };

  /// search related
  search = {
    /**
     * load search result
     * @param keyword {string}
     * @param options {string[]} - options from optionList
     * @param page {number}
     * @returns {Promise<{comics: Comic[], maxPage: number}>}
     */
    load: async (keyword, options, page) => {
      const pageSize = 20;
      let url = `${this.api}/search`;
      let params = {
        keyword,
        type: "mh",
        page,
        pageSize,
      };
      let data = await this.fetchJson(url, { params }).then((res) => res.data);
      let total = data.total;
      let comics = data.list.map((item) => {
        return new Comic({
          id: item.id.toString(),
          title: item.title,
          subTitle: item.author,
          cover: item.cover,
          tags: item.tags.split(","),
          description: item.description,
          status: item.status == 0 ? "连载中" : "已完结",
        });
      });
      let maxPage = Math.ceil(total / pageSize);
      return {
        comics,
        maxPage,
      };
    },
  };

  // Official BaseUtil/chapter.js: ordinary images pass through; encrypted
  // responses contain a 16-byte IV followed by AES-CBC/PKCS7 ciphertext.
  imageLoadingConfig = () => ({
    onResponse: (data) => {
      const bytes = new Uint8Array(data);
      if ((bytes[0] === 0xff && bytes[1] === 0xd8) ||
          (bytes[0] === 0x89 && bytes[1] === 0x50) ||
          (bytes[0] === 0x47 && bytes[1] === 0x49) ||
          (bytes[0] === 0x52 && bytes[1] === 0x49)) return data;
      if (bytes.length <= 16 || (bytes.length - 16) % 16 !== 0) {
        throw new Error("Invalid encrypted image response");
      }
      // Public website asset key, not an account credential.
      const plain = new Uint8Array(Convert.decryptAesCbc(
        bytes.slice(16).buffer,
        Convert.encodeUtf8("0B6666A0-BB59-1381-B746-a0E4C9AC"),
        bytes.slice(0, 16).buffer,
      ));
      // Venera's AES primitive leaves PKCS7 padding intact.
      const padding = plain[plain.length - 1];
      if (padding < 1 || padding > 16 ||
          !plain.slice(-padding).every((value) => value === padding)) {
        throw new Error("Invalid encrypted image padding");
      }
      return plain.slice(0, -padding).buffer;
    },
  });

  /// single comic related
  comic = {
    onImageLoad: () => this.imageLoadingConfig(),
    onThumbnailLoad: () => this.imageLoadingConfig(),
    /**
     * load comic info
     * @param id {string}
     * @returns {Promise<ComicDetails>}s
     */
    loadInfo: async (id) => {
      let url = `${this.api}/comic/${id}`;
      let data = await this.fetchJson(url, { payload: undefined }).then(
        (res) => res.data
      );
      this.logger.warn(`loadInfo: ${data}`);
      let chapterId = data.id;
      let chapterApi = `${this.api}/comic/chapter`;
      let params = {
        comicId: chapterId,
        page: 1,
        pageSize: 1,
      };
      let pageRes = await this.fetchJson(chapterApi, { params });
      let total = pageRes.pagination.total;

      let chapterRes = await this.fetchJson(chapterApi, {
        params: {
          ...params,
          pageSize: total,
        },
      });
      let chapterList = chapterRes.data;
      let chapters = new Map();
      chapterList.forEach((item) => {
        chapters.set(item.id.toString(), item.title.toString());
      });

      const isFavorite = this.isLogged ? await this.favoriteStatus(id) : undefined;
      return new ComicDetails({
        isFavorite,
        title: data.title.toString(),
        subTitle: data.author.toString(),
        cover: data.cover,
        tags: {
          类型: data.tags.split(","),
          状态: data.status == 0 ? "连载中" : "已完结",
        },
        chapters,
        description: data.intro,
        updateTime: new Date(data.editTime * 1000).toLocaleDateString(),
      });
    },
    /**
     * load images of a chapter
     * @param comicId {string}
     * @param epId {string?}
     * @returns {Promise<{images: string[]}>}
     */
    loadEp: async (comicId, epId) => {
      let imgApi = `${this.api}/comic/image/${epId}`;
      const images = [];
      let page = 1;
      let total;
      do {
        const data = await this.fetchJson(imgApi, {
          params: { page, page_size: 60, image_source: "https://mwtuwu.cc" },
        }).then((res) => res.data);
        total = Number(data.pagination.total);
        if (!Number.isInteger(total) || total < 1 || !Array.isArray(data.images) ||
            data.images.length === 0 || data.images.some((item) => !item.url)) {
          throw new Error("Invalid or empty chapter images");
        }
        images.push(...data.images.map((item) => item.url));
        page++;
      } while (images.length < total);
      return {
        images,
      };
    },
  };
}
