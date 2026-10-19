class Comick extends ComicSource {
    name = "comick"
    key = "comick"
    version = "1.2.2"
    minAppVersion = "1.4.0"
    // update url
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/comick.js"

    settings = {
        domains: {
            title: "主页源",
            type: "select",
            options: [
                {value: "comick.art"},
            ],
            default: "comick.art"
        },
    }

    get baseUrl() {
        // let domain = this.loadSetting('domains') || this.settings.domains.default;
        return `https://comick.art`;
    }

    static comic_status = {
        "1": "连载",
        "2": "完结",
        "3": "休刊",
        "4": "暂停更新",
    }
    static category_param_dict = {
        "romance": "浪漫",
        "comedy": "喜剧",
        "drama": "剧情",
        "fantasy": "奇幻",
        "slice-of-life": "日常",
        "action": "动作",
        "adventure": "冒险",
        "psychological": "心理",
        "mystery": "悬疑",
        "historical": "历史",
        "tragedy": "悲剧",
        "sci-fi": "科幻",
        "horror": "恐怖",
        "isekai": "异世界",
        "sports": "运动",
        "thriller": "惊悚",
        "mecha": "机甲",
        "philosophical": "哲学",
        "wuxia": "武侠",
        "medical": "医疗",
        "magical-girls": "魔法少女",
        "superhero": "超级英雄",
        "shounen-ai": "少年爱",
        "mature": "成年",
        "gender-bender": "性转",
        "shoujo-ai": "少女爱",
        "oneshot": "单篇",
        "web-comic": "网络漫画",
        "doujinshi": "同人志",
        "full-color": "全彩",
        "long-strip": "长条",
        "adaptation": "改编",
        "anthology": "选集",
        "4-koma": "四格",
        "user-created": "用户创作",
        "award-winning": "获奖",
        "official-colored": "官方上色",
        "fan-colored": "粉丝上色",
        "school-life": "校园生活",
        "supernatural": "超自然",
        "magic": "魔法",
        "monsters": "怪物",
        "martial-arts": "武术",
        "animals": "动物",
        "demons": "恶魔",
        "harem": "后宫",
        "reincarnation": "转生",
        "office-workers": "上班族",
        "survival": "生存",
        "military": "军事",
        "crossdressing": "女装",
        "loli": "萝莉",
        "shota": "正太",
        "yuri": "百合",
        "yaoi": "耽美",
        "video-games": "电子游戏",
        "monster-girls": "魔物娘",
        "delinquents": "不良少年",
        "ghosts": "幽灵",
        "time-travel": "时间旅行",
        "cooking": "烹饪",
        "police": "警察",
        "aliens": "外星人",
        "music": "音乐",
        "mafia": "黑帮",
        "vampires": "吸血鬼",
        "samurai": "武士",
        "post-apocalyptic": "后末日",
        "gyaru": "辣妹",
        "villainess": "恶役千金",
        "reverse-harem": "逆后宫",
        "ninja": "忍者",
        "zombies": "僵尸",
        "traditional-games": "传统游戏",
        "virtual-reality": "虚拟现实",
        "adult": "成人",
        "ecchi": "情色",
        "sexual-violence": "性暴力",
        "smut": "肉欲",
    }
    static reversed_category_param_dict = {
    "浪漫": "romance",
    "喜剧": "comedy",
    "剧情": "drama",
    "奇幻": "fantasy",
    "日常": "slice-of-life",
    "动作": "action",
    "冒险": "adventure",
    "心理": "psychological",
    "悬疑": "mystery",
    "历史": "historical",
    "悲剧": "tragedy",
    "科幻": "sci-fi",
    "恐怖": "horror",
    "异世界": "isekai",
    "运动": "sports",
    "惊悚": "thriller",
    "机甲": "mecha",
    "哲学": "philosophical",
    "武侠": "wuxia",
    "医疗": "medical",
    "魔法少女": "magical-girls",
    "超级英雄": "superhero",
    "少年爱": "shounen-ai",
    "成年": "mature",
    "性转": "gender-bender",
    "少女爱": "shoujo-ai",
    "单篇": "oneshot",
    "网络漫画": "web-comic",
    "同人志": "doujinshi",
    "全彩": "full-color",
    "长条": "long-strip",
    "改编": "adaptation",
    "选集": "anthology",
    "四格": "4-koma",
    "用户创作": "user-created",
    "获奖": "award-winning",
    "官方上色": "official-colored",
    "粉丝上色": "fan-colored",
    "校园生活": "school-life",
    "超自然": "supernatural",
    "魔法": "magic",
    "怪物": "monsters",
    "武术": "martial-arts",
    "动物": "animals",
    "恶魔": "demons",
    "后宫": "harem",
    "转生": "reincarnation",
    "上班族": "office-workers",
    "生存": "survival",
    "军事": "military",
    "女装": "crossdressing",
    "萝莉": "loli",
    "正太": "shota",
    "百合": "yuri",
    "耽美": "yaoi",
    "电子游戏": "video-games",
    "魔物娘": "monster-girls",
    "不良少年": "delinquents",
    "幽灵": "ghosts",
    "时间旅行": "time-travel",
    "烹饪": "cooking",
    "警察": "police",
    "外星人": "aliens",
    "音乐": "music",
    "黑帮": "mafia",
    "吸血鬼": "vampires",
    "武士": "samurai",
    "后末日": "post-apocalyptic",
    "辣妹": "gyaru",
    "恶役千金": "villainess",
    "逆后宫": "reverse-harem",
    "忍者": "ninja",
    "僵尸": "zombies",
    "传统游戏": "traditional-games",
    "虚拟现实": "virtual-reality",
    "成人": "adult",
    "情色": "ecchi",
    "性暴力": "sexual-violence",
    "肉欲": "smut"
    }
    static language_dict = {
        'en': '英文',
        'pt-br': '巴西葡萄牙文',
        'es-419': '拉丁美洲西班牙文',
        'ru': '俄文',
        'vi': '越南文',
        'fr': '法文',
        'pl': '波兰文',
        'id': '印度尼西亚文',
        'tr': '土耳其文',
        'it': '意大利文',
        'es': '西班牙文',
        'uk': '乌克兰文',
        'ar': '阿拉伯文',
        'zh-hk': '繁体中文',
        'hu': '匈牙利文',
        'zh': '中文',
        'de': '德文',
        'ko': '韩文',
        'th': '泰文',
        'bg': '保加利亚文',
        'ca': '加泰罗尼亚文',
        'fa': '波斯文',
        'ro': '罗马尼亚文',
        'cs': '捷克文',
        'mn': '蒙古文',
        'he': '希伯来文',
        'pt': '葡萄牙文',
        'hi': '印地文',
        'tl': '他加禄文',
        'fi': '芬兰文',
        'ms': '马来文',
        'eu': '巴斯克文',
        'kk': '哈萨克文',
        'sr': '塞尔维亚文',
        'my': '缅甸文',
        'el': '希腊文',
        'nl': '荷兰文',
        'ja': '日文',
        'uz': '乌兹别克文',
        'eo': '世界语',
        'bn': '孟加拉文',
        'lt': '立陶宛文',
        'ka': '格鲁吉亚文',
        'da': '丹麦文',
        'ta': '泰米尔文',
        'sv': '瑞典文',
        'be': '白俄罗斯文',
        'cv': '楚瓦什文',
        'hr': '克罗地亚文',
        'la': '拉丁文',
        'ne': '尼泊尔文',
        'ur': '乌尔都文',
        'gl': '加利西亚文',
        'no': '挪威文',
        'sq': '阿尔巴尼亚文',
        'ga': '爱尔兰文',
        'te': '泰卢固文',
        'jv': '爪哇文',
        'sl': '斯洛文尼亚文',
        'et': '爱沙尼亚文',
        'az': '阿塞拜疆文',
        'sk': '斯洛伐克文',
        'af': '南非荷兰文',
        'lv': '拉脱维亚文'
    }
    static reversed_language_dict = {
        '英文': 'en',
        '巴西葡萄牙文': 'pt-br',
        '拉丁美洲西班牙文': 'es-419',
        '俄文': 'ru',
        '越南文': 'vi',
        '法文': 'fr',
        '波兰文': 'pl',
        '印度尼西亚文': 'id',
        '土耳其文': 'tr',
        '意大利文': 'it',
        '西班牙文': 'es',
        '乌克兰文': 'uk',
        '阿拉伯文': 'ar',
        '香港繁体中文': 'zh-hk',
        '匈牙利文': 'hu',
        '中文': 'zh',
        '德文': 'de',
        '韩文': 'ko',
        '泰文': 'th',
        '保加利亚文': 'bg',
        '加泰罗尼亚文': 'ca',
        '波斯文': 'fa',
        '罗马尼亚文': 'ro',
        '捷克文': 'cs',
        '蒙古文': 'mn',
        '希伯来文': 'he',
        '葡萄牙文': 'pt',
        '印地文': 'hi',
        '菲律宾文/他加禄文': 'tl',
        '芬兰文': 'fi',
        '马来文': 'ms',
        '巴斯克文': 'eu',
        '哈萨克文': 'kk',
        '塞尔维亚文': 'sr',
        '缅甸文': 'my',
        '希腊文': 'el',
        '荷兰文': 'nl',
        '日文': 'ja',
        '乌兹别克文': 'uz',
        '世界语': 'eo',
        '孟加拉文': 'bn',
        '立陶宛文': 'lt',
        '格鲁吉亚文': 'ka',
        '丹麦文': 'da',
        '泰米尔文': 'ta',
        '瑞典文': 'sv',
        '白俄罗斯文': 'be',
        '楚瓦什文': 'cv',
        '克罗地亚文': 'hr',
        '拉丁文': 'la',
        '尼泊尔文': 'ne',
        '乌尔都文': 'ur',
        '加利西亚文': 'gl',
        '挪威文': 'no',
        '阿尔巴尼亚文': 'sq',
        '爱尔兰文': 'ga',
        '泰卢固文': 'te',
        '爪哇文': 'jv',
        '斯洛文尼亚文': 'sl',
        '爱沙尼亚文': 'et',
        '阿塞拜疆文': 'az',
        '斯洛伐克文': 'sk',
        '南非荷兰文': 'af',
        '拉脱维亚文': 'lv'
    }

    static getRandomHeaders() {
        // Keep one identity across requests and image retries (including Cloudflare cookies).
        return { "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://comick.art/" };
    }

    _body(res) {
        if (res.status === 401) throw "登录已过期，请重新网页登录";
        const html = res.body || "";
        const challenge = /\bid=["']cf-chl-|\/cdn-cgi\/challenge-platform\//i.test(html);
        const challengeTitle = /<title[^>]*>\s*(?:just a moment[.!…]*|checking your browser[.!…]*|attention required!?(?:\s*\|\s*cloudflare)?)\s*<\/title>/i.test(html);
        const appData = /<script[^>]*\bid=["'](?:sv-data|comic-data)["']/i.test(html);
        if (/^\s*</.test(html) && (challenge || (challengeTitle && !appData))) {
            throw "Cloudflare 验证未完成，请在网页登录后重试";
        }
        if (res.status !== 200) throw `Comick HTTP ${res.status}`;
        if (typeof res.body !== "string" || !res.body.trim()) throw "Comick 响应为空";
        return res.body;
    }

    _json(text) {
        try { return JSON.parse(text); } catch (_) { throw "Comick JSON 数据无效，可能需要网页登录验证"; }
    }

    _embedded(res, id) {
        const doc = new HtmlDocument(this._body(res));
        const element = doc.getElementById(id);
        if (!element) throw `Comick 页面缺少 ${id}，请检查登录状态或站点结构`;
        return this._json(element.text);
    }

    _slug(id) {
        if (typeof id !== "string") throw "漫画 ID 无效";
        let slug = id.split("//")[0];
        if (id.startsWith(this.baseUrl + "/comic/")) slug = id.substring((this.baseUrl + "/comic/").length).split(/[/?#]/)[0];
        else if (id.startsWith("/comic/")) slug = id.substring(7).split(/[/?#]/)[0];
        if (!/^[a-z0-9_%.-]+$/i.test(slug) || slug === "." || slug === "..") throw "漫画 slug 无效";
        return slug;
    }

    _imageUrl(value) {
        if (typeof value !== "string" || !value.trim()) throw "漫画图片地址缺失";
        if (/^https?:\/\/[^/\s]+\//i.test(value)) return value;
        if (/^\/\/[^/\s]+\//.test(value)) return "https:" + value;
        if (value.startsWith("/") && !value.includes("\\")) return this.baseUrl + value;
        throw "漫画图片地址无效";
    }

    _date(value) {
        if (!value) return "";
        const date = new Date(value);
        return isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
    }

    transReformBookList(list) { return this.transformBookList(list.map(book => book.relates)); }
    transformBookList(list, descriptionPrefix = "更新至：") {
        if (!Array.isArray(list)) throw "漫画列表结构已变化";
        return list.map(book => this.getFormattedManga(book, descriptionPrefix));
    }
    getFormattedManga(manga, descriptionPrefix = "更新至：") {
        if (!manga || typeof manga.title !== "string" || !manga.title.trim()) throw "漫画标题缺失";
        const slug = this._slug(manga.slug);
        const date = this._date(manga.uploaded_at || manga.created_at);
        return {
            id: `${slug}//${manga.title}`,
            title: manga.title,
            cover: this._imageUrl(manga.default_thumbnail || manga.full_image_path || "/images/default-thumbnail.webp"),
            tags: date ? [`更新时间: ${date}`] : [],
            description: manga.description || `${descriptionPrefix}${manga.last_chapter ?? "未知"}`
        };
    }

    _cursors = new Map();
    async _listing(query, page) {
        if (!Number.isInteger(page) || page < 1) throw "页码无效";
        // The website ignores page=2: its official search client uses next_cursor.
        let cursors = this._cursors.get(query);
        if (!cursors || page === 1) { cursors = new Map([[1, null]]); this._cursors.set(query, cursors); }
        let result;
        for (let current = 1; current <= page; current++) {
            if (current < page && cursors.has(current + 1)) continue;
            const cursor = cursors.get(current);
            if (current > 1 && cursor == null) return { comics: [], maxPage: current - 1 };
            const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
            const data = this._json(this._body(await Network.get(`${this.baseUrl}/api/search?${query}${suffix}`, Comick.getRandomHeaders())));
            if (!Array.isArray(data?.data)) throw "Comick 搜索列表结构已变化";
            if (Object.prototype.hasOwnProperty.call(data, "next_cursor")) {
                if (data.next_cursor != null && (typeof data.next_cursor !== "string" || !data.next_cursor)) throw "分页游标无效";
                if (data.next_cursor && [...cursors.entries()].some(([p, value]) => p <= current && value === data.next_cursor)) throw "Comick 返回了重复分页游标";
                cursors.set(current + 1, data.next_cursor);
                result = { comics: this.transformBookList(data.data), maxPage: data.next_cursor ? current + 1 : current };
            } else throw "Comick 分页信息缺失";
        }
        // Bound memory when many distinct searches are performed in one app session.
        if (this._cursors.size > 30) this._cursors.delete(this._cursors.keys().next().value);
        return result;
    }

    explore = [{
        title: "comick", type: "singlePageWithMultiPart",
        load: async () => {
            const data = this._embedded(await Network.get(this.baseUrl + "/home", Comick.getRandomHeaders()), "sv-data").data;
            return { "最近更新": this.transformBookList(data.most_follow_new['7']), "最近上传": this.transformBookList(data.recent_add),
                "最近热门": this.transformBookList(data.popular_ongoing), "完结": this.transformBookList(data.completed) };
        }
    }];
    category = {
        title: "comick", parts: [{ name: "类型", type: "fixed", categories: Object.values(Comick.category_param_dict), itemType: "category", categoryParams: Object.keys(Comick.category_param_dict) }], enableRankingPage: false
    };
    categoryComics = {
        load: async (category, param, options, page) => {
            const params = [`genres[]=${encodeURIComponent(param)}`];
            if (options?.[0]) params.push(`order_by=${encodeURIComponent(options[0].split("-")[0])}`);
            if (options?.[1] && options[1] !== "-全部") params.push(`country[]=${encodeURIComponent(options[1].split("-")[0])}`);
            if (options?.[2]) params.push(`status=${encodeURIComponent(options[2].split("-")[0])}`);
            return this._listing(params.join("&"), page);
        },
        optionList: [
            {options: ["created_at-更新排序", "user_follow_count-关注排序", "rating-评分排序", "uploaded-创建排序"]},
            {options: ["-全部", "cn-国漫", "jp-日本", "kr-韩国", "others-欧美"]},
            {options: ["1-连载", "2-完结", "3-休刊", "4-暂停更新"]}
        ]
    };
    search = { load: async (keyword, options, page) => this._listing(`q=${encodeURIComponent(keyword)}`, page), optionList: [] };

    _loginUserId = null;
    _webLoginPending = false;
    account = {
        loginWithWebview: {
            // The official login redirects to / (not necessarily to My List).
            // checkStatus selects a completed navigation; onLoginSuccess validates
            // the cookies that Venera imports afterwards, before the WebView closes.
            url: "https://comick.art/user/login",
            checkStatus: (url, title) => {
                if (typeof url !== "string") return false;
                const path = url.split(/[?#]/)[0];
                if (path === this.baseUrl + "/user/login" || path === this.baseUrl + "/user/login/") {
                    // Venera merges imported cookies. Clear the app's previous session
                    // once per attempt, so it cannot mask a missing browser token.
                    // The WebView has its own cookie store and remains logged in.
                    if (!this._webLoginPending) {
                        Network.deleteCookies(this.baseUrl);
                        this.deleteData("account");
                        this._loginUserId = null;
                        this._webLoginPending = true;
                    }
                    return false;
                }
                if (typeof title !== "string" || !title.trim() || /just a moment|cloudflare|checking|login|sign in|验证/i.test(title)) return false;
                const match = path.match(/^https:\/\/comick\.art\/user\/([a-z0-9-]+)\/list\/?$/i);
                const home = (path === this.baseUrl || path === this.baseUrl + "/" || path === this.baseUrl + "/home" || path === this.baseUrl + "/home/") &&
                    /^ComicK\s*-\s*(?:Comick\.io|HOME)$/i.test(title.trim());
                if (!match && !home) return false;
                this._loginUserId = match ? match[1] : null;
                return true;
            },
            onLoginSuccess: () => {
                try {
                    const session = this._session();
                    if (this._loginUserId && session.userId !== this._loginUserId) throw "登录账号与收藏页不一致，请打开自己的 My List";
                } finally {
                    this._loginUserId = null;
                    this._webLoginPending = false;
                }
            }
        },
        logout: () => {
            Network.deleteCookies(this.baseUrl);
            this.deleteData("_localStorage");
            this.deleteData("account");
            this._loginUserId = null;
            this._webLoginPending = false;
        }
    };

    _session() {
        // The official client reads this cookie and sends it as a Bearer token.
        const cookie = Network.getCookies(this.baseUrl + "/").find(c => c.name === "token");
        if (!cookie?.value) throw "未取得登录会话，请在网页完成 Cloudflare 验证和登录";
        let token, payload;
        try {
            token = decodeURIComponent(cookie.value);
            const parts = token.split(".");
            if (parts.length !== 3 || !parts.every(p => /^[a-z0-9_-]+$/i.test(p))) throw "invalid";
            let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            while (base64.length % 4) base64 += "=";
            payload = JSON.parse(Convert.decodeUtf8(Convert.decodeBase64(base64)));
        } catch (_) { throw "登录令牌无效，请重新网页登录"; }
        if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) throw "登录已过期，请重新网页登录";
        const userId = payload.user?.uuid;
        if (typeof userId !== "string" || !/^[a-z0-9-]+$/i.test(userId)) throw "登录账号 ID 缺失，请重新网页登录";
        // Local decoding selects the API path; the server independently validates the token.
        return { token, userId };
    }

    async _accountRequest(method, path, values) {
        const session = this._session();
        const headers = { ...Comick.getRandomHeaders(), "Authorization": `Bearer ${session.token}`, "Content-Type": "application/json", "Origin": this.baseUrl };
        const extra = { maskDataInLog: true, maskHeadersInLog: ["Authorization", "Cookie"], maskResponseInLog: true };
        const res = await Network.sendRequest(method, this.baseUrl + path, headers, values === undefined ? undefined : JSON.stringify(values), extra);
        if (res.status === 401 || res.status === 403) throw `账号访问失败 HTTP ${res.status}，请重新登录并完成 Cloudflare 验证`;
        const result = this._json(this._body(res));
        if (result?.success === false) throw "账号接口未确认成功，请刷新登录状态后重试";
        return result;
    }

    async _favorites() {
        const session = this._session();
        const result = await this._accountRequest("GET", `/api/user/${session.userId}/list`);
        if (!Array.isArray(result?.data)) throw "收藏列表结构已变化";
        const types = ["unfollowed", "reading", "completed", "on_hold", "dropped", "plan_to_read"];
        for (const row of result.data) {
            if (!row?.comic || !Number.isInteger(row.comic.id) || row.comic.id <= 0 || !types.includes(row.type)) throw "收藏条目结构已变化";
        }
        return result.data;
    }

    favorites = {
        multiFolder: false,
        loadComics: async page => {
            if (!Number.isInteger(page) || page < 1) throw "收藏页码无效";
            const rows = await this._favorites();
            const followed = rows.filter(row => row.type !== "unfollowed");
            const pageSize = 50;
            return { comics: followed.slice((page - 1) * pageSize, page * pageSize).map(row => ({ ...this.getFormattedManga(row.comic), favoriteId: String(row.comic.id) })), maxPage: Math.max(1, Math.ceil(followed.length / pageSize)) };
        },
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            this._session();
            if (typeof isAdding !== "boolean") throw "收藏操作无效";
            const data = await this._detail(this._slug(comicId));
            if (!Number.isInteger(data.id) || data.id <= 0) throw "收藏漫画 ID 无效";
            const before = await this._favorites();
            const row = before.find(row => row.comic.id === data.id);
            if (Boolean(row && row.type !== "unfollowed") === isAdding) return true;
            const values = { comic_id: data.id, chapter_id: row?.chapter?.id ?? null, type: isAdding ? "reading" : "unfollowed" };
            if (isAdding) values.followed_at = new Date().toISOString();
            await this._accountRequest("POST", "/api/follow", values);
            const after = await this._favorites();
            if (after.some(row => row.comic.id === data.id && row.type !== "unfollowed") !== isAdding) throw "服务器尚未确认收藏变更，请刷新后重试";
            return true;
        }
    };

    _canonicalSlugs = new Map();
    async _detail(slug) {
        const data = this._embedded(await Network.get(`${this.baseUrl}/comic/${slug}`, Comick.getRandomHeaders()), "comic-data");
        const canonical = this._slug(data.slug);
        this._canonicalSlugs.set(slug, canonical);
        this._canonicalSlugs.set(canonical, canonical);
        return data;
    }

    async _chapters(slug) {
        const load = async page => {
            const data = this._json(this._body(await Network.get(`${this.baseUrl}/api/comics/${slug}/chapter-list?page=${page}`, Comick.getRandomHeaders())));
            if (!Array.isArray(data?.data)) throw "章节列表结构已变化";
            const last = Number(data.pagination?.last_page);
            if (!Number.isInteger(last) || last < page || last > 10000) throw "章节分页信息无效";
            if (Number(data.pagination.current_page) !== page) throw "章节页码重复或不正确";
            if (page > 1 && !data.data.length) throw "章节分页为空，无法完整加载";
            return data;
        };
        const first = await load(1), lastPage = Number(first.pagination.last_page);
        const total = first.pagination.total;
        if (total != null && (!Number.isInteger(Number(total)) || Number(total) < 0)) throw "章节总数无效";
        const pages = [first];
        let nextPage = 2;
        // Long series can have thousands of translated releases. Keep every page,
        // with at most three requests in flight, and restore API ordering afterwards.
        await Promise.all(Array.from({ length: Math.min(3, lastPage - 1) }, async () => {
            while (nextPage <= lastPage) {
                const page = nextPage++;
                const data = await load(page);
                if (Number(data.pagination.last_page) !== lastPage) throw "章节列表在加载时变化，请重试";
                if (total != null && Number(data.pagination.total) !== Number(total)) throw "章节总数在加载时变化，请重试";
                pages[page - 1] = data;
            }
        }));
        const items = [], seen = new Set();
        for (const data of pages) {
            let added = 0;
            for (const item of data.data) {
                if (item?.hid == null || String(item.hid) === "" || !/^[a-z0-9_-]+$/i.test(String(item.hid))) throw "章节 ID 缺失或无效";
                const key = String(item.hid);
                if (!seen.has(key)) { seen.add(key); items.push(item); added++; }
            }
            if (pages.length > 1 && !added) throw "章节分页为空或重复，无法完整加载";
        }
        if (total != null && items.length !== Number(total)) throw "章节加载不完整，请刷新后重试";
        const groups = new Map();
        for (const item of items.slice().reverse()) {
            const lang = item.lang || "unknown";
            const display = Comick.language_dict[lang] || lang;
            if (!groups.has(display)) groups.set(display, new Map());
            const hasChap = item.chap != null && item.chap !== "";
            const hasVol = item.vol != null && item.vol !== "";
            const type = hasChap ? "chapter" : hasVol ? "volume" : "no";
            const number = hasChap ? item.chap : hasVol ? item.vol : "-1";
            let label = hasChap ? `第${item.chap}话` : hasVol ? `第${item.vol}卷` : item.title || "无标卷";
            if (hasChap && item.title) label += ` ${item.title}`;
            if (Array.isArray(item.group_name) && item.group_name.length) label += ` [${item.group_name.join(", ")}]`;
            groups.get(display).set(`${item.hid}//${type}//${number}//${lang}`, label);
        }
        return { groups, updated: this._date(items[0]?.updated_at || items[0]?.publish_at || items[0]?.created_at) };
    }

    _readerUrl(comicId, epId) {
        let path = epId;
        if (typeof path !== "string" || !path) throw "章节 ID 无效";
        if (path.startsWith(this.baseUrl + "/")) path = path.substring(this.baseUrl.length);
        if (path.startsWith("/comic/")) {
            if (!/^\/comic\/[a-z0-9_%.-]+\/[a-z0-9_%.-]+(?:\?page=\d+)?$/i.test(path)) throw "章节地址无效";
            const tail = path.substring(7).split("/")[1];
            return `${this.baseUrl}/comic/${comicId}/${tail}`;
        }
        const [hid, type, chapter, lang] = path.split("//");
        if (!/^[a-z0-9_-]+$/i.test(hid) || !["chapter", "volume", "no"].includes(type) || !chapter || !/^[a-z0-9-]+$/i.test(lang || "")) throw "章节 ID 格式无效";
        if (type !== "no" && !/^[a-z0-9_.-]+$/i.test(chapter)) throw "章节编号无效";
        // Official reader links always use "chapter", even for releases without a
        // chapter number. The hid identifies the release; volume/bare-hid routes 404.
        return `${this.baseUrl}/comic/${comicId}/${hid}-chapter-${type === "chapter" ? chapter : "null"}-${lang}`;
    }

    comic = {
        id: null, buildId: null,
        loadInfo: async (id) => {
            const oldSlug = this._slug(id), data = await this._detail(oldSlug), slug = this._slug(data.slug);
            const { groups, updated } = await this._chapters(slug);
            if (!groups.size && Number(data.chapter_count) > 0) throw "漫画有章节，但章节列表为空";
            const card = this.getFormattedManga(data);
            const genreRows = data.md_comic_md_genres || [];
            const tags = genreRows.map(g => g.md_genres?.slug).filter(Boolean).map(g => Comick.category_param_dict[g] || g);
            this.comic.id = id;
            const isFavorite = this.isLogged ? (await this._favorites()).some(row => row.comic.id === data.id && row.type !== "unfollowed") : undefined;
            return {
                title: card.title, cover: card.cover, description: data.desc || data.description || "暂无描述",
                tags: { "作者": (data.authors || []).map(a => a.name).filter(Boolean), "更新": [updated || (data.last_chapter != null ? `第${data.last_chapter}话` : "暂无更新")], "标签": tags, "状态": [Comick.comic_status[data.status] || "未知"] },
                chapters: groups, isFavorite, url: `${this.baseUrl}/comic/${slug}`
            };
        },
        loadEp: async (comicId, epId) => {
            const oldSlug = this._slug(comicId);
            // Saved readers may be opened without visiting loadInfo first.
            if (!this._canonicalSlugs.has(oldSlug)) await this._detail(oldSlug);
            const slug = this._canonicalSlugs.get(oldSlug);
            let url = this._readerUrl(slug, epId);
            const visited = new Set(), images = [];
            while (url) {
                if (visited.has(url) || visited.size >= 100) throw "阅读分页重复或超出限制";
                visited.add(url);
                const res = await Network.get(url, Comick.getRandomHeaders());
                const data = this._embedded(res, "sv-data");
                if (!Array.isArray(data.chapter?.images) || !data.chapter.images.length) throw "章节图片缺失，请检查登录状态或稍后重试";
                for (const image of data.chapter.images) images.push(this._imageUrl(image.url));
                const doc = new HtmlDocument(res.body);
                const next = doc.querySelector("a#next-chapter");
                if (next?.text?.match(/下一页|下一頁/)) {
                    if (!next.attributes?.href) throw "阅读下一页地址缺失";
                    url = this._readerUrl(slug, next.attributes.href);
                } else url = null;
            }
            return { images };
        },
        onImageLoad: (url, comicId, epId) => {
            const headers = Comick.getRandomHeaders();
            return { url, method: "GET", headers, onLoadFailed: () => ({ url, method: "GET", headers }) };
        },
        onThumbnailLoad: url => {
            const headers = Comick.getRandomHeaders();
            return { url, method: "GET", headers, onLoadFailed: () => ({ url, method: "GET", headers }) };
        },
        onClickTag: (namespace, tag) => namespace === "标签" ? { action: "category", keyword: tag, param: Comick.reversed_category_param_dict[tag] || tag } : { action: "search", keyword: tag }
    };
}
