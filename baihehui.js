/** @type {import('./_venera_.js')} */
class Baihehui extends ComicSource {
    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "百合会"

    // unique id of the source
    key = "baihehui"

    version = "1.1.0"

    minAppVersion = "1.4.0"

    // update url
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/baihehui.js"

    settings = {
        domains: {
            title: "主页源",
            type: "select",
            options: [
                { value: "yamibo.com" },
            ],
            default: "yamibo.com"
        },
    }

    get baseUrl() {
        return `https://www.${this.loadSetting('domains')}`;
    }

    /**
     * [Optional] init function
     */
    init() {

    }

    // Network manages response cookies; do not discard the session after login.
    async getDocument(path, requiresLogin = false) {
        const res = await Network.get(this.absoluteUrl(path), { "User-Agent": "Mozilla/5.0" });
        if (res.status === 401 || res.status === 403) throw "Login expired";
        if (res.status !== 200) throw `Invalid status code: ${res.status}`;
        const doc = new HtmlDocument(res.body);
        if (requiresLogin && !doc.querySelector('form[action="/user/logout"]')) {
            doc.dispose();
            throw "Login expired";
        }
        return doc;
    }

    absoluteUrl(path) {
        if (/^https?:\/\//.test(path)) return path;
        if (path.startsWith("//")) return "https:" + path;
        return this.baseUrl + (path.startsWith("/") ? path : "/" + path);
    }

    coverUrl(id) {
        const digits = String(Number(id)).padStart(9, "0");
        return `${this.baseUrl}/coverm/${digits.slice(0, 3)}/${digits.slice(3, 6)}/${digits.slice(6)}.jpg`;
    }

    maxPage(doc) {
        let max = 1;
        for (const a of doc.querySelectorAll('.pagination a')) {
            const dataPage = Number(a.attributes['data-page']);
            if (a.attributes['data-page'] !== undefined && Number.isFinite(dataPage)) max = Math.max(max, dataPage + 1);
            const match = (a.attributes.href || "").match(/[?&](?:[^=&]*-)?page=(\d+)/);
            if (match) max = Math.max(max, Number(match[1]));
        }
        return max;
    }

    parseTable(doc, type) {
        const comics = [];
        for (const row of doc.querySelectorAll('tr[data-key]')) {
            const a = row.querySelector('a[href*="/manga/"]');
            const match = (a?.attributes.href || "").match(/\/manga\/(\d+)/);
            if (!match) continue;
            const id = String(Number(match[1]));
            const cells = row.querySelectorAll('td');
            comics.push(new Comic({ id, title: a.text.trim(), cover: this.coverUrl(id),
                tags: type === "a" ? [cells[4]?.text.trim(), cells[5]?.text.trim()].filter(Boolean)
                    : type === "b" ? [cells[3]?.text.replace(/\[|\]/g, "").trim(), cells[4]?.text.trim()].filter(Boolean) : [],
                description: cells.length ? cells[cells.length - 1].text.trim() : "" }));
        }
        return { comics, maxPage: this.maxPage(doc) };
    }

    account = {
        login: async (username, password) => {
            Network.deleteCookies(this.baseUrl);
            const doc = await this.getDocument('/user/login');
            let csrf;
            try { csrf = doc.querySelector('meta[name="csrf-token"]')?.attributes.content; }
            finally { doc.dispose(); }
            if (!csrf) throw "登录页缺少 CSRF token";
            const form = [['_csrf-frontend', csrf], ['LoginForm[username]', username],
                ['LoginForm[password]', password], ['LoginForm[rememberMe]', '1'], ['login-button', '登录']]
                .map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
            const res = await Network.post(this.baseUrl + '/user/login', {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': this.baseUrl + '/user/login', 'User-Agent': 'Mozilla/5.0'
            }, form);
            if (res.status >= 400) throw "登录失败";
            const check = await this.getDocument('/my/fav', true);
            try {
                if (!check.querySelector('form[action="/user/logout"]')) throw "登录失败，请检查用户名和密码";
            } finally { check.dispose(); }
            return true;
        },
        logout: () => { Network.deleteCookies(this.baseUrl); },
        registerWebsite: "https://www.yamibo.com/user/signup"
    }

    favorites = {
        multiFolder: false,
        loadComics: async (page) => {
            const doc = await this.getDocument(`/my/fav?page=${page}&per-page=10`, true);
            try {
                const comics = [];
                // The same page also contains novels: only include manga cards.
                for (const card of doc.querySelectorAll('.list-view .thumbnail')) {
                    const a = card.querySelector('h4 a[href*="/manga/"]');
                    const match = (a?.attributes.href || "").match(/\/manga\/(\d+)/);
                    if (!match) continue;
                    const id = String(Number(match[1]));
                    const img = card.querySelector('img');
                    comics.push(new Comic({ id, title: a.text.trim(),
                        cover: img ? this.absoluteUrl(img.attributes.src) : this.coverUrl(id) }));
                }
                return { comics, maxPage: this.maxPage(doc) };
            } finally { doc.dispose(); }
        },
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            // /fav/work toggles, so check the current state before posting.
            const doc = await this.getDocument(`/manga/${comicId}`, true);
            let csrf, current;
            try {
                const button = doc.querySelector('#btnFav');
                if (!button) throw "无法读取收藏状态";
                current = button.text.includes('取消收藏');
                csrf = doc.querySelector('meta[name="csrf-token"]')?.attributes.content;
            } finally { doc.dispose(); }
            if (current === isAdding) return true;
            if (!csrf) throw "收藏页缺少 CSRF token";
            const res = await Network.post(this.baseUrl + '/fav/work', {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest', 'Referer': this.baseUrl + `/manga/${comicId}`
            }, `type=3&id=${encodeURIComponent(comicId)}&_csrf-frontend=${encodeURIComponent(csrf)}`);
            if (res.status === 401 || res.status === 403) throw "Login expired";
            if (res.status !== 200) throw `收藏请求失败: ${res.status}`;
            const result = JSON.parse(res.body);
            if (!result.succ) throw result.msg || "收藏操作失败";
            if (Boolean(result.status) !== isAdding) throw "收藏状态与请求不一致，请刷新后重试";
            return true;
        }
    }

    static category_types = {
        "全部作品": "manga/list@a@?",
        "原创": "manga/list?q=4@a@&",
        "同人": "manga/list?q=6@a@&",
    }

    static article_types = {
        "翻页漫画": "search/type?type=3&tag=@b@翻页漫画",
        "条漫": "search/type?type=3&tag=@b@条漫",
        "四格": "search/type?type=3&tag=@b@四格",
        "绘本": "search/type?type=3&tag=@b@绘本",
        "杂志": "search/type?type=3&tag=@b@杂志",
        "合志": "search/type?type=3&tag=@b@合志",
    }

    static relate_types = {
        "编辑推荐": "manga/rcmds?type=3012@c@&",
        "最近更新": "manga/latest@c@?",
        "原创推荐": "manga/rcmds?type=3014@c@&",
        "同人推荐": "manga/rcmds?type=3015@c@&",
    }




// explore page list
explore = [
    {
        title: "百合会",
        type: "singlePageWithMultiPart",
        load: async (page) => {
                // 1. 拿到 HTML
                let res = await Network.get(this.baseUrl + "/site/manga");
                if (res.status !== 200) {
                    throw `Invalid status code: ${res.status}`;
                }

                // 2. 解析文档
                let doc = new HtmlDocument(res.body);

                // 3. 通用解析单元函数
                const parseItem = (el) => {
                    let a = el.querySelector(".media-img") || el.querySelector("a.media-img");
                    let href = a.attributes.href;
                    let id = href.match(/\/manga\/(\d+)/)[1];
                    // 从 style 中提取 url
                    let style = a.attributes.style || "";
                    let cover = this.absoluteUrl(style.match(/url\([\'"]?([^\'")]+)[\'"]?\)/)?.[1] || this.coverUrl(id));
                    let title = el.querySelector("h3 a").text.trim();
                    return new Comic({ id, title, cover });
                }

                // 4. 抓「编辑推荐」
                let editor = [];
                let editorEls = doc.querySelectorAll(".recommend-list .media-cell.horizontal");
                for (let el of editorEls) {
                    editor.push(parseItem(el));
                }

                // 5. 抓「最近更新」
                let latest = [];
                // 找到标题元素，再拿其后面的 <ul> 下的 .media-cell.vertical
                let latestTitle = doc.querySelectorAll("h2.module-title")
                    .find(e => e.text.includes("最近更新"));
                if (latestTitle) {
                    let ul = latestTitle.nextElementSibling;
                    if (ul) {
                        let items = ul.querySelectorAll(".media-cell.vertical");
                        for (let el of items) latest.push(parseItem(el));
                    }
                }

                // 原创推荐
                let original = [];
                let originalTitle = doc.querySelectorAll("h2.module-title")
                    .find(e => e.text.includes("原创推荐"));
                if (originalTitle) {
                    let ul = originalTitle.nextElementSibling;
                    if (ul) {
                        let items = ul.querySelectorAll(".media-cell.vertical");
                        for (let el of items) original.push(parseItem(el));
                    }
                }

                // 6. 抓「同人推荐」
                let fan = [];
                let fanTitle = doc.querySelectorAll("h2.module-title")
                    .find(e => e.text.includes("同人推荐"));
                if (fanTitle) {
                    let ul = fanTitle.nextElementSibling;
                    if (ul) {
                        let items = ul.querySelectorAll(".media-cell.vertical");
                        for (let el of items) fan.push(parseItem(el));
                    }
                }

                // 7. 清理并返回
                doc.dispose();
                return {
                    "编辑推荐": editor,
                    "最近更新": latest,
                    "原创推荐": original,
                    "同人推荐": fan
                };
            }
    }
];

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "百合会",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: Object.keys(Baihehui.category_types),
                itemType: "category",
                categoryParams: Object.values(Baihehui.category_types),
            },
            {
                name: "作品类型（需要登陆）",
                type: "fixed",
                categories: Object.keys(Baihehui.article_types),
                itemType: "category",
                categoryParams: Object.values(Baihehui.article_types),
            },
            {
                name: "更多推荐",
                type: "fixed",
                categories: Object.keys(Baihehui.relate_types),
                itemType: "category",
                categoryParams: Object.values(Baihehui.relate_types),
            },
        ],
        // enable ranking page
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, params, options, page) => {
            const [path, type, suffix] = params.split('@');
            const url = type === 'b'
                ? `/${path}${encodeURIComponent(suffix)}&sort=updated_at&page=${page}&per-page=50`
                : `/${path}${suffix}sort=updated_at&page=${page}&per-page=50`;
            const doc = await this.getDocument(url, type === 'b');
            try { return this.parseTable(doc, type); } finally { doc.dispose(); }
        }
    }

    search = {
        load: async (keyword, options, page) => {
            const doc = await this.getDocument(`/search/manga?SearchForm%5Bkeyword%5D=${encodeURIComponent(keyword)}&page=${page}`);
            try { return this.parseTable(doc); } finally { doc.dispose(); }
        },
        optionList: [],
        enableTagsSuggestions: false
    }

    /// single comic related
    comic = {
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            let res = await Network.get(`${this.baseUrl}/manga/${id}`);
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }

            let document = new HtmlDocument(res.body);

            // 提取漫画标题
            let title = document.querySelector("h3.col-md-12").text.trim();

            // 提取封面图片
            let cover = this.absoluteUrl(document.querySelector("img.img-responsive")?.attributes.src || this.coverUrl(id));

            // 提取作者信息
            let author = "";
            document.querySelectorAll("p").forEach(p => {
                if (p.text.includes("作者：")) {
                    author = p.text.replace("作者：", "").trim();
                }
            });

            // 提取标签
            let tags = [];
            document.querySelectorAll("a.label.label-ntype").forEach(tag => {
                tags.push(tag.text.trim());
            });

            // 提取更新时间
            let updateTime = "";
            document.querySelectorAll("p").forEach(p => {
                if (p.text.includes("更新时间：")) {
                    updateTime = p.text.replace("更新时间：", "").trim();
                }
            });

            // 提取简介
            //let description = document.querySelector("div.panel-body > div.panel-collapse > div.panel-body").text.trim();
            let description = document.querySelector(".panel-collapse .panel-body")?.text.trim() || "";

            // 提取章节信息
            let chapters = new Map();
            document.querySelectorAll("div[data-key]").forEach(chapter => {
                let chapterKey = chapter.attributes['data-key']; // 获取 data-key 值
                let chapterTitle = chapter.querySelector("a").text.trim(); // 获取章节标题
                chapters.set(chapterKey, chapterTitle); // 将 data-key 和章节标题存入 Map
            });

            const details = {
                title: title,
                cover: cover,
                description: description,
                tags: {
                    "作者": [author],
                    "更新": [updateTime],
                    "标签": tags
                },
                chapters: chapters,
                isFavorite: document.querySelector("#btnFav")?.text.includes("取消收藏") ?? false
            };
            document.dispose();
            return details;

        },
        loadComments: async (comicId, subId, page, replyTo) => {
            let url = `${this.baseUrl}/manga/${comicId}?dp-1-page=${page}`;
            let res = await Network.get(url, {
                "User-Agent": "Mozilla/5.0"
            });

            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }

            let document = new HtmlDocument(res.body);

            // 提取评论总数
            let totalCommentsMatch = (document.querySelector("div.panel-body")?.text || "").match(/共(\d+)篇/);
            let totalComments = totalCommentsMatch ? parseInt(totalCommentsMatch[1]) : 0;

            // 提取评论列表
            let comments = [];
            document.querySelectorAll("div.post.row").forEach(post => {
                let userName = post.querySelector("span.cmt-username > a").text.trim();
                let avatar = this.absoluteUrl(post.querySelector("img.cmt-avatar").attributes.src);
                let content = post.querySelector("div.row > p").text.trim();
                let time = post.querySelector("span.description").text.replace("在 ", "").trim();
                let replyCountMatch = (post.querySelector("a.btn.btn-sm")?.text || "").match(/(\d+) 条回复/);
                let replyCount = replyCountMatch ? parseInt(replyCountMatch[1]) : 0;
                let id = post.querySelector("button.btn_reply").attributes['pid'];

                comments.push({
                    userName: userName,
                    avatar: avatar,
                    content: content,
                    time: time,
                    replyCount: replyCount,
                    id: id
                });
            });

            // 计算最大页数
            let maxPageElement = document.querySelector("li.last > a");
            let maxPage = maxPageElement ? parseInt(maxPageElement.attributes['data-page']) + 1 : 1;

            document.dispose();
            return {
                comments: comments,
                totalComments: totalComments,
                maxPage: maxPage
            };
        },

        loadEp: async (comicId, epId) => {
            const path = `/manga/view-chapter?id=${encodeURIComponent(epId)}`;
            const images = [];
            let maxPage = 1;
            for (let page = 1; page <= maxPage; page++) {
                const doc = await this.getDocument(`${path}&page=${page}`, true);
                try {
                    if (page === 1) maxPage = this.maxPage(doc);
                    const imgs = doc.querySelectorAll('img#imgPic');
                    if (!imgs.length) throw `Image not found on page ${page}.`;
                    for (const img of imgs) images.push(this.absoluteUrl(img.attributes.src));
                } finally { doc.dispose(); }
            }
            return { images };
        },

        // enable tags translate
        enableTagsTranslate: false,
    }
}