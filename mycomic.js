/** @type {import('./_venera_.js')} */

const BASE_URL = "https://mycomic.com/cn";
const ORIGIN = "https://mycomic.com";
const CDN_URL = "https://biccam.com";
const REFERER = "https://mycomic.com/";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const headers = {
    "User-Agent": UA,
    "Referer": REFERER,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
};

function responseText(body) {
    if (body === null || body === undefined) return "";
    return typeof body === "string" ? body : Convert.decodeUtf8(body);
}

function isCloudflareChallenge(status, body, responseHeaders) {
    const mitigated = Object.keys(responseHeaders || {}).some(key =>
        key.toLowerCase() === "cf-mitigated" && String(responseHeaders[key]).toLowerCase() === "challenge");
    return mitigated || /<title[^>]*>\s*(?:Just a moment|Checking your browser|Attention Required!\s*\|\s*Cloudflare)/i.test(body) ||
        /(?:id=["']cf-(?:chl|browser-verification)|__cf_chl_)/i.test(body) ||
        ((status === 403 || status === 503) && /challenge-platform|cf-browser-verification/i.test(body));
}

/**
 * Wrapper for Network.get that detects Cloudflare challenges
 * and preserves Venera's interactive verification marker
 * @param {string} url
 * @returns {Promise<{status: number, headers: object, body: string}>}
 */
async function fetchWithCFCheck(url) {
    const resp = await Network.get(url, headers);
    resp.body = responseText(resp.body);
    if (isCloudflareChallenge(resp.status, resp.body, resp.headers)) {
        // Venera recognizes this marker and opens its Cloudflare verification UI.
        throw "CloudflareException: " + url;
    }
    return resp;
}

// Mask credential requests and ask supporting hosts to mask private responses.
// Older native hosts ignore maskResponseInLog; it is not a privacy guarantee.
async function accountRequest(method, url, data, useXsrf) {
    const requestHeaders = {
        "User-Agent": UA,
        "Referer": BASE_URL + "/bookmarks",
        "Origin": ORIGIN,
        "Accept": method === "GET" ? "text/html" : "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "cache-time": "no",
    };
    if (method !== "GET") requestHeaders["Content-Type"] = "application/json";
    if (useXsrf) {
        const token = (Network.getCookies(ORIGIN + "/") || []).find(cookie => cookie.name === "XSRF-TOKEN");
        if (!token || !token.value) throw "登录验证信息缺失，请先通过 Cloudflare 验证后重新登录";
        try { requestHeaders["X-XSRF-TOKEN"] = decodeURIComponent(token.value); }
        catch (_) { throw "登录验证信息无效，请重新登录"; }
    }
    const extra = {
        followRedirects: false,
        maskDataInLog: true, maskResponseInLog: true, maskQueryInLog: true,
        maskHeadersInLog: ["Cookie", "cookie", "X-XSRF-TOKEN", "x-xsrf-token", "Set-Cookie", "set-cookie"],
    };
    let result;
    try {
        const body = data === undefined ? null : JSON.stringify(data);
        // The direct bridge also masks logs on hosts whose Network wrappers do
        // not forward the optional extra argument.
        result = typeof sendMessage === "function"
            ? await sendMessage({ method: "http", http_method: method, url, headers: requestHeaders, data: body, extra })
            : await Network.sendRequest(method, url, requestHeaders, body, extra);
        if (result.error) throw result.error;
    } catch (error) {
        const message = String(error && error.message || error);
        if (/CloudflareException/i.test(message)) throw "CloudflareException: " + url;
        if (/ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) throw "Network request failed: DNS ENOTFOUND";
        if (/timeout|timed out|AbortError/i.test(message)) throw "Network request timeout";
        throw "Network request failed: 网络请求失败，请稍后重试";
    }
    result.body = responseText(result.body);
    if (isCloudflareChallenge(result.status, result.body, result.headers)) throw "CloudflareException: " + url;
    if (result.status === 401) throw "Login expired: 登录会话失效，请重新登录";
    if (result.status === 419) throw "Login expired: 登录验证信息已过期，请重新登录";
    if (result.status < 200 || result.status >= 300) throw "账号请求失败，HTTP " + result.status;
    return result;
}

function bookmarkPage(html) {
    const doc = new HtmlDocument(html);
    const logout = doc.querySelectorAll("button").some(button =>
        /axios\.post\(\s*['"](?:https:\/\/mycomic\.com)?\/logout['"]/.test(button.attributes["@click"] || ""));
    if (!logout) {
        if (/登入以继续|登入以繼續|登录以继续|登入|登錄|登录/.test(doc.text || html)) {
            throw "Login expired: 请先登录 MYCOMIC 账号，仅通过 Cloudflare 验证不能读取收藏";
        }
        throw "收藏页面结构无法识别，未确认账号登录";
    }
    const table = doc.querySelector("table[data-flux-table]");
    if (!table) {
        if (/未有记录|未有紀錄|暂无记录|暫無記錄/.test(doc.text || html)) return { comics: [], maxPage: 1 };
        throw "收藏页面结构已变化，未找到收藏表格";
    }
    const body = table.querySelector("tbody");
    if (!body) throw "收藏页面结构已变化，未找到收藏条目区域";
    const rows = body.querySelectorAll("tr");
    const empty = /未有记录|未有紀錄|暂无记录|暫無記錄/.test(body.text);
    if (!body.querySelector("a[href*='/cn/comics/']") && empty) return { comics: [], maxPage: 1 };
    if (!rows.length) throw "收藏页面未确认空收藏，无法读取全部收藏";
    const comics = [], seen = new Set();
    for (const row of rows) {
        const link = row.querySelector("a[href*='/cn/comics/']");
        const match = /^(?:https:\/\/mycomic\.com)?\/cn\/comics\/([1-9]\d*)(?:[?#].*)?$/.exec(link && link.attributes["href"] || "");
        const image = row.querySelector("img");
        const cover = image && (image.attributes["data-src"] || image.attributes["src"]);
        const title = ((image && image.attributes["alt"]) || (link && (link.attributes["title"] || link.text)) || "").trim();
        if (!match || !title || !cover || !/^https:\/\//.test(cover)) throw "收藏条目不完整，无法读取全部收藏";
        if (seen.has(match[1])) throw "收藏页面包含重复条目，无法确认完整收藏";
        seen.add(match[1]);
        const chapter = row.querySelector("a[href*='/cn/chapters/']");
        comics.push(new Comic({ id: match[1], title, cover, description: chapter ? chapter.text.trim() : "", language: "zh-Hans" }));
    }
    return { comics, maxPage: parseMaxPage(html) };
}

async function loadBookmarkPage(page) {
    const suffix = page > 1 ? "?page=" + page : "";
    const response = await accountRequest("GET", BASE_URL + "/bookmarks" + suffix);
    return bookmarkPage(response.body);
}

function comicId(value) {
    const id = String(value);
    if (!/^[1-9]\d*$/.test(id)) throw "漫画 ID 无效";
    return id;
}

async function bookmarkState(id) {
    const response = await accountRequest("POST", ORIGIN + "/comics/" + comicId(id), {}, true);
    let state;
    try { state = JSON.parse(response.body); }
    catch (_) { throw "收藏状态接口未返回有效 JSON"; }
    if (!state || typeof state.isLoggedIn !== "boolean" || typeof state.hasBookmarked !== "boolean") {
        throw "收藏状态接口响应结构已变化";
    }
    if (!state.isLoggedIn) throw "Login expired: 登录会话失效，请重新登录";
    return state.hasBookmarked;
}

async function importAccountCookies(values) {
    const raw = values && values[0];
    if (typeof raw !== "string" || !raw.trim() || /[\r\n]/.test(raw)) return false;
    const cookies = [];
    for (const part of raw.replace(/^Cookie:\s*/i, "").split(";")) {
        const match = /^\s*([!#$%&'*+.^_`|~\w-]+)=([^;]*)$/.exec(part);
        if (!match) return false;
        cookies.push(new Cookie({ name: match[1], value: match[2].trim(), domain: ".mycomic.com", path: "/" }));
    }
    const previous = Network.getCookies(ORIGIN + "/") || [];
    Network.deleteCookies(ORIGIN);
    Network.setCookies(ORIGIN, cookies);
    try {
        await loadBookmarkPage(1);
        return true;
    } catch (error) {
        Network.deleteCookies(ORIGIN);
        Network.setCookies(ORIGIN, previous);
        if (/Login expired/.test(String(error))) return false;
        throw error;
    }
}

/**
 * Extract meta tag content from raw HTML
 * @param {string} html
 * @param {string} name - meta name or property (e.g. "description", "og:title")
 * @returns {string|null}
 */
function getMetaContent(html, name) {
    // pattern 1: <meta name="x" content="y"> or <meta property="x" content="y">
    let m = new RegExp(
        "<meta[^>]*?(?:name|property)=['\"]" + escapeRegex(name) + "['\"][^>]*?content=['\"]([^'\"]*)['\"]",
        "i"
    ).exec(html);
    if (m) return m[1];
    // pattern 2: <meta content="y" name="x"> or <meta content="y" property="x">
    m = new RegExp(
        "<meta[^>]*?content=['\"]([^'\"]*)['\"][^>]*?(?:name|property)=['\"]" + escapeRegex(name) + "['\"]",
        "i"
    ).exec(html);
    if (m) return m[1];
    return null;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse comic list from an HtmlDocument
 * Finds all <a> links to /cn/comics/{id} that contain an <img> with a CDN cover
 * @param {HtmlDocument} doc
 * @returns {Comic[]}
 */
function parseComicList(doc) {
    const links = doc.querySelectorAll("a[href*='/cn/comics/']");
    const comics = [];
    const seen = new Set();

    links.forEach((a) => {
        const href = a.attributes["href"] || "";
        const match = /\/cn\/comics\/(\d+)/.exec(href);
        if (!match) return;
        const id = match[1];
        if (seen.has(id)) return;

        const img = a.querySelector("img");
        if (!img) return;

        // Cover: prefer data-src (lazy-loaded), fallback to src
        let cover = img.attributes["data-src"] || img.attributes["src"] || "";
        if (!cover || cover.indexOf("biccam.com/comics/") === -1) return;

        // Title from alt attribute
        const title = (img.attributes["alt"] || "").trim() || id;

        // Latest chapter info
        let description = "";
        const chapterDiv = a.querySelector("div.truncate");
        if (chapterDiv) {
            description = chapterDiv.text.trim();
        }

        seen.add(id);
        comics.push(
            new Comic({
                id: id,
                title: title,
                cover: cover,
                description: description,
                language: "zh-Hans",
            })
        );
    });

    return comics;
}

/**
 * Extract max page number from pagination links in raw HTML
 * @param {string} html
 * @returns {number}
 */
function parseMaxPage(html) {
    const pageMatches = html.match(/(?:href=['"][^'"]*page=)(\d+)/g);
    if (!pageMatches) return 1;
    let max = 1;
    pageMatches.forEach((m) => {
        const n = parseInt(m.replace(/.*page=/, ""), 10);
        if (!isNaN(n) && n > max) max = n;
    });
    return max;
}

/**
 * Build a comics listing URL with optional filters
 * @param {number} page
 * @param {string} sort - sort param (e.g. "-update", "-views", "-id")
 * @param {string} q - search keyword
 * @param {string} filterType - "tag" | "country" | "audience" | "year" | "end"
 * @param {string} filterValue - filter value
 * @returns {string}
 */
function buildComicsUrl(page, sort, q, filterType, filterValue) {
    const params = [];
    if (q) params.push("q=" + encodeURIComponent(q));
    if (sort) params.push("sort=" + sort);
    if (filterType && filterValue) {
        params.push("filter[" + filterType + "]=" + filterValue);
    }
    if (page && page > 1) params.push("page=" + page);
    const query = params.join("&");
    return BASE_URL + "/comics" + (query ? "?" + query : "");
}

class MyComic extends ComicSource {
    name = "MYCOMIC";

    key = "mycomic";

    version = "1.1.1";

    minAppVersion = "1.4.6";

    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/mycomic.js";

    init() {
        // Cloudflare clearance is separate from the MYCOMIC account session.
        const cookies = Network.getCookies("https://mycomic.com");
        let hasCfClearance = false;
        if (cookies && cookies.length > 0) {
            for (let i = 0; i < cookies.length; i++) {
                if (cookies[i].name === "cf_clearance") {
                    hasCfClearance = true;
                    break;
                }
            }
        }
        if (!hasCfClearance) {
            console.log("[MyComic] 如遇 Cloudflare 拦截，请先使用 Venera 的验证页面完成验证，再登录账号。");
        }
    }

    // ==================== Account ====================

    account = {
        login: async (email, password) => {
            if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
                throw "Login failed: 请填写邮箱和密码";
            }
            // Venera's password form takes precedence over cookie fields. This
            // explicit mode keeps full-cookie import usable in the same form.
            if (email.trim().toLowerCase() === "cookie") {
                if (!await importAccountCookies([password])) throw "Login failed: Cookie 未包含有效账号会话";
                return "ok";
            }
            // Obtain Laravel's session/XSRF cookies before sending credentials.
            // A challenge is thrown here, so credentials are never posted to it.
            await accountRequest("GET", BASE_URL + "/bookmarks");
            await accountRequest("POST", BASE_URL + "/login", { email: email.trim(), password }, true);
            await loadBookmarkPage(1);
            return "ok";
        },
        // Kept for adapters using the cookie validator directly. Native Venera
        // must render its username/password form when account.login is present.
        loginWithCookies: {
            fields: null,
            validate: importAccountCookies,
        },

        logout: () => {
            Network.deleteCookies(ORIGIN);
            this.deleteData("account");
        },

        registerWebsite: null,
    };

    favorites = {
        multiFolder: false,
        loadComics: async (page) => {
            const requestedPage = page || 1;
            if (!Number.isInteger(requestedPage) || requestedPage < 1) throw "收藏页码无效";
            return await loadBookmarkPage(requestedPage);
        },
        addOrDelFavorite: async (id, folderId, isAdding) => {
            id = comicId(id);
            if (typeof isAdding !== "boolean") throw "收藏操作无效";
            await loadBookmarkPage(1);
            const before = await bookmarkState(id);
            if (before === isAdding) return "ok";
            await accountRequest(isAdding ? "POST" : "DELETE", ORIGIN + "/comics/" + id + "/bookmark", {}, true);
            if (await bookmarkState(id) !== isAdding) throw "收藏操作未生效，请刷新后重试";
            return "ok";
        },
    };

    // ==================== Explore ====================

    explore = [
        {
            title: "最新上架",
            type: "multiPageComicList",
            load: async (page) => {
                if (!page) page = 1;
                const url = buildComicsUrl(page, "-id");
                const resp = await fetchWithCFCheck(url);
                if (resp.status !== 200) throw "HTTP " + resp.status;
                const doc = new HtmlDocument(resp.body);
                const comics = parseComicList(doc);
                const maxPage = parseMaxPage(resp.body);
                return { comics, maxPage };
            },
        },
        {
            title: "最近更新",
            type: "multiPageComicList",
            load: async (page) => {
                if (!page) page = 1;
                const url = buildComicsUrl(page, "-update");
                const resp = await fetchWithCFCheck(url);
                if (resp.status !== 200) throw "HTTP " + resp.status;
                const doc = new HtmlDocument(resp.body);
                const comics = parseComicList(doc);
                const maxPage = parseMaxPage(resp.body);
                return { comics, maxPage };
            },
        },
        {
            title: "最高人气",
            type: "multiPageComicList",
            load: async (page) => {
                if (!page) page = 1;
                const url = buildComicsUrl(page, "-views");
                const resp = await fetchWithCFCheck(url);
                if (resp.status !== 200) throw "HTTP " + resp.status;
                const doc = new HtmlDocument(resp.body);
                const comics = parseComicList(doc);
                const maxPage = parseMaxPage(resp.body);
                return { comics, maxPage };
            },
        },
    ];

    // ==================== Category ====================

    category = {
        title: "MYCOMIC",
        parts: [
            {
                name: "作品类型",
                type: "fixed",
                categories: [
                    "魔幻", "魔法", "热血", "冒险", "悬疑", "侦探", "爱情",
                    "校园", "搞笑", "四格", "科幻", "神鬼", "舞蹈", "音乐",
                    "百合", "后宫", "机战", "格斗", "恐怖", "萌系", "武侠",
                    "社会", "历史", "耽美", "励志", "职场", "生活", "治愈",
                    "伪娘", "黑道", "战争", "竞技", "体育", "美食", "腐女",
                    "宅男", "推理", "杂志",
                ],
                itemType: "category",
                categoryParams: [
                    "tag:mohuan", "tag:mofa", "tag:rexue", "tag:maoxian",
                    "tag:xuanyi", "tag:zhentan", "tag:aiqing", "tag:xiaoyuan",
                    "tag:gaoxiao", "tag:sige", "tag:kehuan", "tag:shengui",
                    "tag:wudao", "tag:yinyue", "tag:baihe", "tag:hougong",
                    "tag:jizhan", "tag:gedou", "tag:kongbu", "tag:mengxi",
                    "tag:wuxia", "tag:shehui", "tag:lishi", "tag:danmei",
                    "tag:lizhi", "tag:zhichang", "tag:shenghuo", "tag:zhiyu",
                    "tag:weiniang", "tag:heidao", "tag:zhanzheng", "tag:jingji",
                    "tag:tiyu", "tag:meishi", "tag:funv", "tag:zhainan",
                    "tag:tuili", "tag:zazhi",
                ],
            },
            {
                name: "作品地区",
                type: "fixed",
                categories: ["日本", "港台", "欧美", "内地", "韩国", "其他"],
                itemType: "category",
                categoryParams: [
                    "country:japan", "country:hongkong", "country:europe",
                    "country:china", "country:korea", "country:other",
                ],
            },
            {
                name: "适合受众",
                type: "fixed",
                categories: ["少女", "少年", "青年", "儿童", "通用"],
                itemType: "category",
                categoryParams: [
                    "audience:shaonv", "audience:shaonian", "audience:qingnian",
                    "audience:ertong", "audience:tongyong",
                ],
            },
            {
                name: "出品年份",
                type: "fixed",
                categories: [
                    "2026", "2025", "2024", "2023", "2022", "2021",
                    "2020", "2019", "2018", "2017", "2016", "2015",
                    "2014", "2013", "2012", "2011", "2010",
                    "00年代", "90年代", "80年代", "70年代或更早",
                ],
                itemType: "category",
                categoryParams: [
                    "year:2026", "year:2025", "year:2024", "year:2023",
                    "year:2022", "year:2021", "year:2020", "year:2019",
                    "year:2018", "year:2017", "year:2016", "year:2015",
                    "year:2014", "year:2013", "year:2012", "year:2011",
                    "year:2010", "year:200x", "year:199x", "year:198x",
                    "year:197x",
                ],
            },
            {
                name: "目前进度",
                type: "fixed",
                categories: ["连载中", "已完结"],
                itemType: "category",
                categoryParams: ["end:0", "end:1"],
            },
        ],
        enableRankingPage: true,
    };

    // ==================== Category Comics ====================

    categoryComics = {
        load: async (category, param, options, page) => {
            if (!page) page = 1;

            // Parse filter type and value from param (format: "type:value")
            let filterType = null;
            let filterValue = null;
            let sort = "-id";

            if (param) {
                const parts = param.split(":");
                if (parts.length >= 2) {
                    filterType = parts[0];
                    filterValue = parts.slice(1).join(":");
                }
            }

            // Get sort option
            if (options && options.length > 0 && options[0]) {
                sort = options[0];
            }

            const url = buildComicsUrl(page, sort, null, filterType, filterValue);
            const resp = await fetchWithCFCheck(url);
            if (resp.status !== 200) throw "HTTP " + resp.status;

            const doc = new HtmlDocument(resp.body);
            const comics = parseComicList(doc);
            const maxPage = parseMaxPage(resp.body);

            return { comics, maxPage };
        },

        optionList: [
            {
                options: [
                    "-id-最新上架",
                    "-update-最近更新",
                    "-views-最高人气",
                ],
            },
        ],

        ranking: {
            options: [
                "-views-历史排行",
                "-week-週排行",
                "-month-月排行",
            ],
            load: async (option, page) => {
                if (!page) page = 1;
                const sort = option || "-views";
                const url =
                    BASE_URL +
                    "/rank?sort=" +
                    sort +
                    (page > 1 ? "&page=" + page : "");
                const resp = await fetchWithCFCheck(url);
                if (resp.status !== 200) throw "HTTP " + resp.status;

                const doc = new HtmlDocument(resp.body);
                const comics = parseComicList(doc);
                const maxPage = parseMaxPage(resp.body);

                return { comics, maxPage };
            },
        },
    };

    // ==================== Search ====================

    search = {
        load: async (keyword, options, page) => {
            if (!page) page = 1;
            const kw = (keyword || "").trim();
            if (!kw) return { comics: [], maxPage: 1 };

            let sort = null;
            if (options && options.length > 0 && options[0]) {
                sort = options[0];
            }

            const url = buildComicsUrl(page, sort, kw);
            const resp = await fetchWithCFCheck(url);
            if (resp.status !== 200) throw "HTTP " + resp.status;

            const doc = new HtmlDocument(resp.body);
            const comics = parseComicList(doc);
            const maxPage = parseMaxPage(resp.body);

            return { comics, maxPage };
        },

        optionList: [
            {
                type: "select",
                options: [
                    "-id-最新上架",
                    "-update-最近更新",
                    "-views-最高人气",
                ],
                label: "排序",
                default: null,
            },
        ],

        enableTagsSuggestions: false,
    };

    // ==================== Comic Detail ====================

    comic = {
        loadInfo: async (id) => {
            const url = BASE_URL + "/comics/" + id;
            const resp = await fetchWithCFCheck(url);
            if (resp.status !== 200) throw "HTTP " + resp.status;

            const html = resp.body;
            const doc = new HtmlDocument(html);

            // Parse meta tags
            let title = getMetaContent(html, "og:title") || id;
            title = title.replace(/\s*-\s*MYCOMIC.*$/, "").trim();

            const description = getMetaContent(html, "description") || "";
            const author = getMetaContent(html, "author") || "";
            const cover =
                getMetaContent(html, "og:image") ||
                CDN_URL + "/comics/" + id + ".jpg";
            const keywords = getMetaContent(html, "keywords") || "";

            // Parse tags from filter links on the page
            const tags = new Map();
            const tagLinks = doc.querySelectorAll(
                "a[href*='filter%5Btag%5D']"
            );
            const tagNames = [];
            tagLinks.forEach((a) => {
                const text = a.text.trim();
                if (text) tagNames.push(text);
            });
            if (tagNames.length) tags.set("类型", tagNames);

            // Parse additional info from keywords
            const keywordList = keywords
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            if (author) tags.set("作者", [author]);

            // Try to extract country and audience from keywords
            const countryMap = {
                日本: "日本",
                内地: "内地",
                韩国: "韩国",
                欧美: "欧美",
                港台: "港台",
                其他: "其他",
            };
            const audienceMap = {
                少年: "少年",
                少女: "少女",
                青年: "青年",
                儿童: "儿童",
                通用: "通用",
            };
            const countries = [];
            const audiences = [];
            keywordList.forEach((kw) => {
                if (countryMap[kw]) countries.push(kw);
                if (audienceMap[kw]) audiences.push(kw);
            });
            if (countries.length) tags.set("地区", countries);
            if (audiences.length) tags.set("受众", audiences);

            // Parse chapter list from Alpine.js x-data
            // The x-data attribute contains: chapters: [{"id":96338,"title":"第16回"}, ...]
            const chapters = new Map();
            const chapterMatch = /chapters:\s*(\[[\s\S]*?\])/.exec(html);
            if (chapterMatch) {
                try {
                    const chapterList = JSON.parse(chapterMatch[1]);
                    chapterList.forEach((ch) => {
                        chapters.set(String(ch.id), ch.title);
                    });
                } catch (e) {
                    // Fallback: try to find chapter links in the page
                    const chapterLinks = doc.querySelectorAll(
                        "a[href*='/cn/chapters/']"
                    );
                    chapterLinks.forEach((a) => {
                        const href = a.attributes["href"] || "";
                        const m = /\/cn\/chapters\/(\d+)/.exec(href);
                        if (m) {
                            const chTitle = a.text.trim();
                            if (chTitle && !chapters.has(m[1])) {
                                chapters.set(m[1], chTitle);
                            }
                        }
                    });
                }
            }

            const isFavorite = this.isLogged ? await bookmarkState(id) : undefined;
            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                thumbnails: [cover],
                url: url,
                uploader: author || undefined,
                isFavorite,
            });
        },

        loadEp: async (comicId, epId) => {
            if (!epId) {
                throw "No episode id";
            }
            const url = BASE_URL + "/chapters/" + epId;
            const resp = await fetchWithCFCheck(url);
            if (resp.status !== 200) throw "HTTP " + resp.status;

            const doc = new HtmlDocument(resp.body);
            // Chapter images have class "page" and src or data-src from biccam.com/chapters/
            const imgs = doc.querySelectorAll("img.page");
            const images = [];

            if (imgs.length > 0) {
                imgs.forEach((img) => {
                    let src =
                        img.attributes["data-src"] ||
                        img.attributes["src"] ||
                        "";
                    if (src && src.indexOf("biccam.com/chapters/") !== -1) {
                        images.push(src);
                    }
                });
            }

            // Fallback: find all imgs with src containing biccam.com/chapters/
            if (images.length === 0) {
                const allImgs = doc.querySelectorAll("img");
                allImgs.forEach((img) => {
                    let src =
                        img.attributes["data-src"] ||
                        img.attributes["src"] ||
                        "";
                    if (src && src.indexOf("biccam.com/chapters/") !== -1) {
                        images.push(src);
                    }
                });
            }

            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                url: url,
                headers: {
                    "Referer": REFERER,
                    "User-Agent": UA,
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "Sec-Fetch-Dest": "image",
                    "Sec-Fetch-Mode": "no-cors",
                    "Sec-Fetch-Site": "cross-site",
                },
            };
        },

        onThumbnailLoad: (url) => {
            return {
                url: url,
                headers: {
                    "Referer": REFERER,
                    "User-Agent": UA,
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "Sec-Fetch-Dest": "image",
                    "Sec-Fetch-Mode": "no-cors",
                    "Sec-Fetch-Site": "cross-site",
                },
            };
        },

        onClickTag: (namespace, tag) => {
            return {
                page: "search",
                attributes: {
                    keyword: tag,
                },
            };
        },

        link: {
            domains: ["mycomic.com"],
            linkToId: (url) => {
                const m = /https?:\/\/(?:www\.)?mycomic\.com\/(?:cn\/)?comics\/(\d+)/.exec(
                    url
                );
                if (!m) return null;
                return m[1];
            },
        },
    };
}
