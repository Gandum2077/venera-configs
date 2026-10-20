/**
 * 章节图片解码器 — 移植自 keiyoushi/extensions-source (PR #16898)
 *
 * /api/v2/chapter/getinfo 接口返回的图片列表是混淆后的字符串，而非普通数组。
 * 此解码器将该字符串还原为原始 JSON 图片数组。
 *
 * 解码流程：去除 "J7r" 前缀 / "nQ" 后缀 → 按 "kD" 和 "W4s" 标记拆分为 3 段
 * → 重新排序为 段3+段1+段2 → 每隔一个 7 字符块反转 → 将自定义字母表映射回
 * 标准 base64url → base64 解码 → UTF-8 JSON。
 */
const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CUSTOM = "_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DECODE_PREFIX = "J7r";
const DECODE_MARKER1 = "kD";
const DECODE_MARKER2 = "W4s";
const DECODE_SUFFIX = "nQ";
const DECODE_GROUP = 7;
// Native Venera reads login metadata before registering settings. Keep account
// login on the official origin; browsing domains remain independently editable.
const GODA_LOGIN_ORIGIN = "https://godamh.com";

// 预计算的查找表：自定义字母表字符码 → 标准 base64url 字符码（-1 表示无效）
const DECODE_TABLE = new Array(128).fill(-1);
for (let i = 0; i < CUSTOM.length; i++) {
    DECODE_TABLE[CUSTOM.charCodeAt(i)] = STD.charCodeAt(i);
}

function decodeChapterImages(input) {
    if (typeof input !== "string" || !input.startsWith(DECODE_PREFIX) || !input.endsWith(DECODE_SUFFIX)) {
        throw "未知的章节数据格式";
    }
    const body = input.substring(DECODE_PREFIX.length, input.length - DECODE_SUFFIX.length);
    const payloadLen = body.length - DECODE_MARKER1.length - DECODE_MARKER2.length;
    if (payloadLen <= 0) {
        throw "未知的章节数据格式";
    }

    const aLen = Math.floor(payloadLen / 3);
    const bLen = Math.floor((payloadLen - aLen) / 2);
    const cLen = payloadLen - aLen - bLen;

    const part1 = body.substring(0, bLen);
    const marker1 = body.substring(bLen, bLen + DECODE_MARKER1.length);
    const part2 = body.substring(bLen + DECODE_MARKER1.length, bLen + DECODE_MARKER1.length + cLen);
    const marker2 = body.substring(bLen + DECODE_MARKER1.length + cLen, bLen + DECODE_MARKER1.length + cLen + DECODE_MARKER2.length);
    const part3 = body.substring(bLen + DECODE_MARKER1.length + cLen + DECODE_MARKER2.length);

    if (marker1 !== DECODE_MARKER1 || marker2 !== DECODE_MARKER2 || part3.length !== aLen) {
        throw "未知的章节数据格式";
    }

    // 重新排序：段3 + 段1 + 段2
    const reordered = part3 + part1 + part2;

    // 去锯齿：每隔一个 GROUP 长度的块做反转
    let unzigzagged = "";
    for (let i = 0, block = 0; i < reordered.length; i += DECODE_GROUP, block++) {
        const chunk = reordered.substring(i, Math.min(i + DECODE_GROUP, reordered.length));
        unzigzagged += (block % 2 === 1) ? chunk.split('').reverse().join('') : chunk;
    }

    // 将自定义字母表映射为标准 base64url
    let standard = "";
    for (let i = 0; i < unzigzagged.length; i++) {
        const code = unzigzagged.charCodeAt(i);
        const mapped = code < DECODE_TABLE.length ? DECODE_TABLE[code] : -1;
        if (mapped < 0) {
            throw "无效的章节数据字符";
        }
        standard += String.fromCharCode(mapped);
    }

    // Base64 解码（纯 JS 实现，venera 运行时不支持 atob）。先将 base64url 转为标准 base64。
    const standardBase64 = standard.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeBase64(standardBase64);
    return JSON.parse(json);
}

/**
 * 纯 JavaScript base64 解码器（venera 运行时缺少 atob）。
 * 将 base64 解码为字节字符，供 JSON 解析使用。
 */
function decodeBase64(str) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    str = str.replace(/=+$/, "");

    let result = "";
    let i = 0;
    while (i < str.length) {
        const enc1 = chars.indexOf(str.charAt(i));
        const enc2 = chars.indexOf(str.charAt(i + 1));
        const enc3 = str.charAt(i + 2) ? chars.indexOf(str.charAt(i + 2)) : -1;
        const enc4 = str.charAt(i + 3) ? chars.indexOf(str.charAt(i + 3)) : -1;

        if (enc1 < 0 || enc2 < 0) {
            throw "Invalid base64 character";
        }

        result += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
        if (enc3 >= 0) {
            result += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
        }
        if (enc4 >= 0) {
            result += String.fromCharCode(((enc3 & 3) << 6) | enc4);
        }

        i += 4;
    }
    return result;
}

/** @type {import('./_venera_.js')} */
class Goda extends ComicSource {
  // 注意：标记为 [可选] 的字段如果不使用，应将其删除

  // 源名称
  name = "GoDa漫画"

  // 源唯一标识
  key = "goda"

  version = "1.3.3"

  minAppVersion = "1.4.0"

  // 更新地址
  url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/goda.js"

  settings = {
    domains: {
      title: "域名",
      type: "input",
      default: "godamh.com"
    },
    api: {
      title: "API域名",
      type: "input",
      default: "v2.apikk.top"
    },
    image: {
      title: "图片域名",
      type: "input",
      default: "c-nd3-1.6wm.top"
    }
  }

  get baseUrl() {
    return `https://${this.loadSetting("domains")}`;
  }

  get apiUrl() {
    return `https://${this.loadSetting("api")}/api/v2`;
  }

  get imageUrl() {
    return `https://${this.loadSetting("image")}`;
  }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
      "Referer": this.baseUrl
    };
  }

  _webLoginPending = false;

  account = {
    loginWithWebview: {
      url: GODA_LOGIN_ORIGIN + "/login",
      checkStatus: (url, title) => {
        if (typeof url !== "string") return false;
        const path = url.split(/[?#]/)[0];
        if (path === GODA_LOGIN_ORIGIN + "/login" || path === GODA_LOGIN_ORIGIN + "/login/") {
          // Venera merges imported cookies, so an old app session must not
          // conceal a missing cookie from the new browser login.
          if (!this._webLoginPending) {
            Network.deleteCookies(GODA_LOGIN_ORIGIN);
            this.deleteData("account");
            this.deleteData("_localStorage");
            this._webLoginPending = true;
          }
          return false;
        }
        if (typeof title !== "string") return false;
        const home = (path === GODA_LOGIN_ORIGIN || path === GODA_LOGIN_ORIGIN + "/") && title.trim() === "首頁-G站漫畫";
        const shelf = (path === GODA_LOGIN_ORIGIN + "/user/bookmark" || path === GODA_LOGIN_ORIGIN + "/user/bookmark/") && title.trim() === "我的書架-G站漫畫";
        return home || shelf;
      },
      onLoginSuccess: () => {
        // The native host imports cookies before this synchronous callback.
        // The server, rather than a page title or cached local shelf, validates
        // the session on every subsequent account operation.
        try { this._sessionToken(); }
        finally { this._webLoginPending = false; }
      }
    },
    logout: () => {
      Network.deleteCookies(GODA_LOGIN_ORIGIN);
      if (this.baseUrl !== GODA_LOGIN_ORIGIN) Network.deleteCookies(this.baseUrl);
      this.deleteData("account");
      this.deleteData("_localStorage");
      this._webLoginPending = false;
    }
  };

  _publicGet(url) {
    // Network.get in some Venera releases puts extra in the data argument.
    // Use the five-argument request API so imported cookies stay masked.
    return Network.sendRequest("GET", url, this.headers, null, {
      maskHeadersInLog: ["Cookie", "cookie", "Authorization", "authorization"]
    });
  }

  _sessionToken() {
    const cookies = Network.getCookies(GODA_LOGIN_ORIGIN + "/");
    const cookie = Array.isArray(cookies) && cookies.find(item => item.name === "jwt_token");
    if (!cookie || typeof cookie.value !== "string" || !/^[A-Za-z0-9._~-]+$/.test(cookie.value)) {
      throw "未取得登录会话，请在网页完成 Cloudflare 验证和登录";
    }
    return cookie.value;
  }

  async _accountRequest(method, endpoint, data) {
    const url = `https://${this.loadSetting("api")}/api/user/${endpoint}`;
    const headers = {
      // Account endpoints require the same browser UA as public requests.
      "User-Agent": this.headers["User-Agent"],
      "Accept": "application/json",
      "Authorization": this._sessionToken(),
      // Native Venera caches GETs for five seconds even with no-store responses.
      // Account reads must reach the server for current shelf and detail status.
      "cache-time": "no",
      "Origin": GODA_LOGIN_ORIGIN,
      "Referer": GODA_LOGIN_ORIGIN + "/user/bookmark"
    };
    if (method === "POST") headers["Content-Type"] = "application/json";
    const extra = {
      followRedirects: false,
      maskHeadersInLog: ["Authorization", "authorization", "Cookie", "cookie"],
      maskDataInLog: true, maskResponseInLog: true, maskQueryInLog: true
    };
    let res;
    try {
      res = await Network.sendRequest(method, url, headers, method === "GET" ? null : JSON.stringify(data), extra);
    } catch (error) {
      // Preserve Venera's interactive Cloudflare handler without exposing a
      // transport exception that may contain request headers or account data.
      const message = String(error && error.message || error);
      if (/CloudflareException/i.test(message)) throw "CloudflareException: " + url;
      if (/ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) throw "Network request failed: DNS ENOTFOUND";
      if (/CERT_|TLS|SSL/i.test(message)) throw "Network request failed: TLS error";
      if (/timeout|timed out|AbortError/i.test(message)) throw "Network request timeout";
      throw "Network request failed: 收藏接口连接失败，请稍后重试";
    }
    const text = typeof res.body === "string" ? res.body : "";
    const challengeHeader = Object.keys(res.headers || {}).some(key => key.toLowerCase() === "cf-mitigated" && String(res.headers[key]).toLowerCase() === "challenge");
    if (challengeHeader || /cf-chl-|challenge-platform|<title[^>]*>\s*(?:just a moment|checking your browser|attention required)/i.test(text)) {
      throw "Cloudflare 验证未完成，请在网页登录验证后重试";
    }
    if (res.status === 401 || res.status === 403) {
      if (res.status === 401) this.deleteData("account");
      throw `登录会话失效或账号请求被拒绝，HTTP ${res.status}，请重新网页登录`;
    }
    if (res.status === 429) throw "收藏请求过于频繁，HTTP 429，请稍后重试";
    if (res.status < 200 || res.status >= 300) throw `收藏请求失败，HTTP ${res.status}`;
    let result;
    try { result = JSON.parse(text); }
    catch (_) { throw "收藏接口未返回有效 JSON，可能遇到登录验证或页面结构变化"; }
    if (method === "POST") {
      if (!result || typeof result !== "object" || Array.isArray(result) || result.status !== 200 || result.message !== "success") {
        throw "收藏接口未确认操作成功，请刷新后重试";
      }
      return result;
    }
    if (!result || typeof result !== "object" || Array.isArray(result) || !Array.isArray(result.bookmarks)) {
      throw "收藏接口响应结构已变化，未取得完整账号书架";
    }
    return result;
  }

  _mangaId(value) {
    if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
      throw "收藏漫画 ID 无效";
    }
    return Number(value);
  }

  _favoritePath(id) {
    if (typeof id !== "string") throw "收藏漫画地址无效";
    let path = id.split(/[?#]/)[0];
    if (path.startsWith(this.baseUrl + "/")) path = path.substring(this.baseUrl.length);
    if (!/^\/manga\/[^/?#\\\s]+\/?$/.test(path) || /%(?:2f|5c)/i.test(path) || /\/\.{1,2}\/?$/.test(path)) {
      throw "收藏漫画地址无效";
    }
    return path.replace(/\/$/, "");
  }

  async _readBookmarks() {
    const result = await this._accountRequest("GET", "me");
    const ids = new Set(), paths = new Set();
    return result.bookmarks.map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.slug !== "string" || /[/?#\\\s]/.test(item.slug)) {
        throw "收藏条目结构已变化，无法读取完整书架";
      }
      const id = this._mangaId(item.id);
      const path = this._favoritePath("/manga/" + item.slug);
      let cover = item.cover;
      if (typeof cover === "string" && cover.startsWith("//")) cover = "https:" + cover;
      if (typeof cover !== "string" || !/^https?:\/\/[^/\s]+\//i.test(cover) || typeof item.title !== "string" || !item.title.trim()) {
        throw "收藏条目缺少标题或封面，无法读取完整书架";
      }
      if (ids.has(id) || paths.has(path)) throw "收藏接口返回重复漫画，无法确认完整书架";
      ids.add(id); paths.add(path);
      return { id, path, title: item.title.trim(), cover };
    });
  }

  favorites = {
    multiFolder: false,
    loadComics: async (page) => {
      if (!Number.isInteger(page) || page < 1) throw "收藏页码无效";
      const bookmarks = await this._readBookmarks();
      return {
        comics: page === 1 ? bookmarks.map(item => new Comic({ id: item.path, title: item.title, cover: item.cover })) : [],
        maxPage: 1
      };
    },
    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      if (typeof isAdding !== "boolean") throw "收藏操作参数无效";
      const path = this._favoritePath(comicId);
      // Resolve the requested comic independently; never reuse the last opened
      // detail page's numeric ID when editing another comic from the shelf.
      this._sessionToken();
      const res = await this._publicGet(this.baseUrl + path);
      const challengeHeader = Object.keys(res.headers || {}).some(key => key.toLowerCase() === "cf-mitigated" && String(res.headers[key]).toLowerCase() === "challenge");
      if (challengeHeader) throw "Cloudflare 验证未完成，请在网页登录验证后重试";
      if (res.status !== 200) throw `获取收藏漫画失败，HTTP ${res.status}`;
      if (typeof res.body !== "string" || /<title[^>]*>\s*(?:just a moment|checking your browser|attention required)/i.test(res.body)) {
        throw "Cloudflare 验证未完成，请在网页登录验证后重试";
      }
      const doc = new HtmlDocument(res.body);
      const manga = doc.querySelector("#mangachapters");
      // Normal comic pages also contain Cloudflare's background jsd script.
      // Its presence alone is not an interstitial blocking the comic details.
      if (!manga && /cf-chl-|challenge-platform/i.test(res.body)) throw "Cloudflare 验证未完成，请在网页登录验证后重试";
      const id = this._mangaId(manga && manga.attributes["data-mid"]);
      const before = await this._readBookmarks();
      if (before.some(item => item.id === id) === isAdding) return true;
      await this._accountRequest("POST", "bookmark", { mids: [id], action: isAdding ? "add" : "remove" });
      return true;
    }
  };

  parseComics(doc) {
    const result = [];
    for (let item of doc.querySelectorAll(".pb-2")) {
      const link = item.querySelector("a");
      const titleEl = item.querySelector("h3");
      const img = item.querySelector("img");
      if (link && titleEl && img && link.attributes["href"] && img.attributes["src"]) {
        result.push(new Comic({
          id: link.attributes["href"],
          title: titleEl.text,
          cover: img.attributes["src"]
        }));
      }
    }
    return result;
  }

  // 发现页列表
  explore = [
    {
      // 页面标题
      // title 用于标识页面，必须唯一
      title: this.name,

      /// multiPartPage 或 multiPageComicList 或 mixed
      type: "multiPartPage",

      load: async () => {
        const res = await this._publicGet(this.baseUrl);
        const document = new HtmlDocument(res.body);
        const result = [{ title: "近期更新", comics: [], viewMore: null }];
        for (let item of document.querySelector(".pb-unit-md").querySelectorAll(".slicarda")) {
          result[0].comics.push(new Comic({
            id: item.attributes["href"],
            title: item.querySelector("h3").text,
            cover: item.querySelector("img").attributes["src"]
          }))
        }
        const cardlists = document.querySelectorAll(".cardlist");
        const hometitles = document.querySelectorAll(".hometitle");
        for (let i = 0; i < hometitles.length; i++) {
          result.push({
            title: hometitles[i].querySelector("h2").text,
            comics: this.parseComics(cardlists[i]),
            viewMore: {
              page: "category",
              attributes: {
                category: hometitles[i].querySelector("h2").text,
                param: hometitles[i].attributes["href"]
              },
            }
          });
        }
        return result;
      }
    }
  ]

  // 分类
  category = {
    /// 分类页标题，用于标识页面，必须唯一
    title: this.name,
    parts: [
      {
        name: "类型",
        type: "fixed",
        categories: [
          "全部",
          "韩漫",
          "热门漫画",
          "国漫",
          "其他",
          "日漫",
          "欧美"
        ],
        itemType: "category",
        categoryParams: [
          "/manga",
          "/manga-genre/kr",
          "/manga-genre/hots",
          "/manga-genre/cn",
          "/manga-genre/qita",
          "/manga-genre/jp",
          "/manga-genre/ou-mei"
        ],
      },
      {
        name: "标签",
        type: "fixed",
        categories: [
          "复仇",
          "古风",
          "奇幻",
          "逆袭",
          "异能",
          "宅向",
          "穿越",
          "热血",
          "纯爱",
          "系统",
          "重生",
          "冒险",
          "灵异",
          "大女主",
          "剧情",
          "恋爱",
          "玄幻",
          "女神",
          "科幻",
          "魔幻",
          "推理",
          "猎奇",
          "治愈",
          "都市",
          "异形",
          "青春",
          "末日",
          "悬疑",
          "修仙",
          "战斗"
        ],
        itemType: "category",
        categoryParams: [
          "/manga-tag/fuchou",
          "/manga-tag/gufeng",
          "/manga-tag/qihuan",
          "/manga-tag/nixi",
          "/manga-tag/yineng",
          "/manga-tag/zhaixiang",
          "/manga-tag/chuanyue",
          "/manga-tag/rexue",
          "/manga-tag/chunai",
          "/manga-tag/xitong",
          "/manga-tag/zhongsheng",
          "/manga-tag/maoxian",
          "/manga-tag/lingyi",
          "/manga-tag/danvzhu",
          "/manga-tag/juqing",
          "/manga-tag/lianai",
          "/manga-tag/xuanhuan",
          "/manga-tag/nvshen",
          "/manga-tag/kehuan",
          "/manga-tag/mohuan",
          "/manga-tag/tuili",
          "/manga-tag/lieqi",
          "/manga-tag/zhiyu",
          "/manga-tag/doushi",
          "/manga-tag/yixing",
          "/manga-tag/qingchun",
          "/manga-tag/mori",
          "/manga-tag/xuanyi",
          "/manga-tag/xiuxian",
          "/manga-tag/zhandou"
        ],
      }
    ],
    // 是否启用排行榜页面
    enableRankingPage: false,
  }

  /// 分类漫画加载
  categoryComics = {
    load: async (category, params, options, page) => {
      const res = await this._publicGet(`${this.baseUrl}${params}/page/${page}`);
      if (res.status !== 200) {
        throw `Invalid status code: ${res.status}`;
      }
      const document = new HtmlDocument(res.body);
      let maxPage = null;
      try {
        maxPage = parseInt(document.querySelectorAll("button.text-small").pop().text.replaceAll("\n", "").replaceAll(" ", ""));
      } catch(_) {
        maxPage = 1;
      }
      return {
        comics: this.parseComics(document),
        maxPage: maxPage
      };
    }
  }

  /// 搜索相关
  search = {
    load: async (keyword, options, page) => {
      const res = await this._publicGet(`${this.baseUrl}/s/${keyword}?page=${page}`);
      if (res.status !== 200) {
        throw `Invalid status code: ${res.status}`;
      }
      const document = new HtmlDocument(res.body);
      let maxPage = null;
      try {
        maxPage = parseInt(document.querySelectorAll("button.text-small").pop().text.replaceAll("\n", "").replaceAll(" ", ""));
      } catch(_) {
        maxPage = 1;
      }
      return {
        comics: this.parseComics(document),
        maxPage: maxPage
      };
    },
    // 是否启用标签建议
    enableTagsSuggestions: false,
  }

  /// 单部漫画相关
  comic = {
    onThumbnailLoad: (url) => {
      return {
        headers: this.headers
      }
    },
    loadInfo: async (id) => {
      const res = await this._publicGet(this.baseUrl + id);
      if (res.status !== 200) {
        throw `Invalid status code: ${res.status}`;
      }
      const document = new HtmlDocument(res.body);

      const titleEl = document.querySelector(".text-xl");
      const title = titleEl ? (titleEl.text || "").trim().split("   ")[0] : "";

      const coverEl = document.querySelector(".object-cover");
      const cover = (coverEl && coverEl.attributes && coverEl.attributes["src"]) || "";

      const descEl = document.querySelector("p.text-medium");
      const description = descEl ? (descEl.text || "") : "";

      const infos = document.querySelectorAll("div.py-1");
      const tags = { "作者": [], "类型": [], "标签": [] };
      if (infos && infos.length >= 3) {
        if (infos[0]) {
          for (let author of infos[0].querySelectorAll("a > span")) {
            let author_name = (author.text || "").trim();
            if (author_name.endsWith(",")) {
              author_name = author_name.slice(0, -1).trim();
            }
            if (author_name) tags["作者"].push(author_name);
          }
        }
        if (infos[1]) {
          for (let category of infos[1].querySelectorAll("a > span")) {
            let category_name = (category.text || "").trim();
            if (category_name.endsWith(",")) {
              category_name = category_name.slice(0, -1).trim();
            }
            if (category_name) tags["类型"].push(category_name);
          }
        }
        if (infos[2]) {
          for (let tag of infos[2].querySelectorAll("a")) {
            const tagText = (tag.text || "").replace("\n", "").replaceAll(" ", "").replace("#", "");
            if (tagText) tags["标签"].push(tagText);
          }
        }
      }

      const mangaEl = document.querySelector("#mangachapters");
      const mangaId = mangaEl && mangaEl.attributes ? mangaEl.attributes["data-mid"] : null;
      if (!mangaId) {
        throw "无法获取漫画ID";
      }

      const chapters = {};
      const jsonRes = await this._publicGet(`${this.apiUrl}/manga/get?mid=${mangaId}&mode=all&t=${Date.now()}`);
      if (jsonRes.status !== 200) {
        throw `Invalid status code: ${jsonRes.status}`;
      }
      try {
        const jsonData = JSON.parse(jsonRes.body);
        if (jsonData && jsonData["data"] && jsonData["data"]["chapters"]) {
          for (let ch of jsonData["data"]["chapters"]) {
            if (ch["id"] != null && ch["attributes"] && ch["attributes"]["title"] != null) {
              chapters[`${mangaId}@${ch["id"]}`] = ch["attributes"]["title"];
            }
          }
        }
      } catch (e) {
        throw "章节数据解析失败";
      }

      const recommend = [];
      for (let item of document.querySelectorAll("div.cardlist > div.pb-2")) {
        const recLink = item.querySelector("a");
        const recTitle = item.querySelector("h3");
        const recImg = item.querySelector("img");
        if (recLink && recTitle && recImg && recLink.attributes["href"] && recImg.attributes["src"]) {
          recommend.push(new Comic({
            id: recLink.attributes["href"],
            title: recTitle.text,
            cover: recImg.attributes["src"]
          }));
        }
      }
      return new ComicDetails({
        title: title,
        cover: cover,
        description: description,
        tags: tags,
        chapters: chapters,
        recommend: recommend,
        isFavorite: this.isLogged ? (await this._readBookmarks()).some(item => item.id === this._mangaId(mangaId)) : undefined,
      });
    },

    loadEp: async (comicId, epId) => {
      if (!epId || !epId.includes("@")) {
        throw "无效的章节ID";
      }
      const ids = epId.split("@");
      const res = await this._publicGet(`${this.apiUrl}/chapter/getinfo?m=${ids[0]}&c=${ids[1]}`);
      if (res.status !== 200) {
        throw `Invalid status code: ${res.status}`;
      }
      let jsonData;
      try {
        jsonData = JSON.parse(res.body);
      } catch (e) {
        throw "章节数据解析失败";
      }

      // 空值安全检查：防止 API 返回异常数据结构导致崩溃
      if (!jsonData || !jsonData["data"] || !jsonData["data"]["info"]
          || !jsonData["data"]["info"]["images"]) {
        throw "章节图片数据为空";
      }
      const imagesRaw = jsonData["data"]["info"]["images"]["images"];

      let imagesList;
      if (typeof imagesRaw === "string") {
        // v2 API：混淆字符串 — 解码还原为 JSON 数组
        imagesList = decodeChapterImages(imagesRaw);
      } else if (Array.isArray(imagesRaw)) {
        // v1 API（向后兼容）：{url: "...", order: N} 数组
        imagesList = imagesRaw;
      } else {
        // 未知格式的图片数据
        throw "未知的图片数据格式";
      }

      const images = [];
      for (let i of imagesList) {
        if (i && i["url"]) {
          images.push(this.imageUrl + i["url"]);
        }
      }
      return { images };
    },

    // 是否启用标签翻译
    enableTagsTranslate: false,
  }
}
