class MXS extends ComicSource {
    // 漫画源基本信息
    name = "漫小肆";
    key = "mxs";
    version = "1.1.2";
    minAppVersion = "1.5.3";
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/mxs.js";

    // 漫画源设置项
    settings = {
        // 域名选择功能
        domains: {
            title: "选择域名",
            type: "select",
            options: [
                { value: "https://www.mxshm.top", text: "mxshm.top" },
                { value: "https://www.jjmhw1.top", text: "jjmhw1.top" },
                { value: "https://www.jjmh.top", text: "jjmh.top" },
                { value: "https://www.jjmh.cc", text: "jjmh.cc" },
                { value: "https://www.wzd1.cc", text: "wzd1.cc" },
                { value: "https://www.wzdhm1.cc", text: "wzdhm1.cc" },
                { value: "https://www.ikanwzd.cc", text: "ikanwzd.cc" }
            ],
            default: "https://www.mxshm.top"
        },
        
        // 域名检测功能
        domainCheck: {
            title: "检测当前域名",
            type: "callback",
            buttonText: "检测",
            callback: () => {
                const currentDomain = this.loadSetting("domains");
                const startTime = Date.now();
                let isCompleted = false;
                
                // 显示加载对话框
                const loadingId = UI.showLoading(() => {
                    UI.showMessage("检测已取消");
                    isCompleted = true;
                });
                
                // 10秒超时检测
                setTimeout(() => {
                    if (!isCompleted) {
                        UI.cancelLoading(loadingId);
                        UI.showMessage("❌ 连接超时，可能需要 🚀");
                        isCompleted = true;
                    }
                }, 10000);
                
                // 测试网络连接
                Network.get(currentDomain).then(res => {
                    if (isCompleted) return;
                    const delay = Date.now() - startTime;
                    UI.cancelLoading(loadingId);
                    UI.showMessage(`✅ 连接正常，延迟: ${delay}ms`);
                    isCompleted = true;
                }).catch(() => {
                    if (isCompleted) return;
                    UI.cancelLoading(loadingId);
                    UI.showMessage("❌ 连接失败，可能需要 🚀");
                    isCompleted = true;
                });
            }
        }
    };

    // 获取基础URL
    get baseUrl() {
        return this.loadSetting("domains");
    }

    get requestHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.baseUrl}/`
        };
    }

    // 仅允许站内地址，验证码需要和登录请求共用 Network 的 Cookie。
    siteUrl(path, origin = this.baseUrl) {
        if (typeof path !== "string" || !path) throw "页面缺少站内地址";
        if (path.startsWith("/") && !path.startsWith("//")) return origin + path;
        if (path.startsWith(origin + "/")) return path;
        throw "页面返回了无效的站内地址";
    }

    sessionOrigin(url) {
        const origin = typeof url === "string" ? url.match(/^https?:\/\/[^/?#]+/)?.[0] : null;
        if (!this.settings.domains.options.some(domain => domain.value === origin)) throw "无效的会话域名";
        return origin;
    }

    captureSessionCookies(url, required = true) {
        const origin = this.sessionOrigin(url);
        const cookies = Network.getCookies(origin + "/");
        const sessionId = cookies.find(cookie => cookie.name === "PHPSESSID")?.value;
        if (typeof sessionId !== "string" || !sessionId.trim()) {
            if (required) throw "未取得 PHPSESSID，请重新登录";
            return;
        }
        // www 域名仅需要 PHPSESSID，不要求或持久化 nav_switch。
        this.saveData("sessionCookies", { PHPSESSID: sessionId });
    }

    restoreSessionCookies(url) {
        const origin = this.sessionOrigin(url);
        let saved = this.loadData("sessionCookies");
        if (typeof saved?.PHPSESSID !== "string" || !saved.PHPSESSID.trim()) {
            // 兼容升级前已经保存在 Cookie 容器中的登录状态。
            this.captureSessionCookies(origin, false);
            saved = this.loadData("sessionCookies");
        }
        if (typeof saved?.PHPSESSID !== "string" || !saved.PHPSESSID.trim()) return;
        // 兼容旧版双 Cookie 数据，仅保留当前需要的会话标识。
        if (Object.keys(saved).length !== 1) this.saveData("sessionCookies", { PHPSESSID: saved.PHPSESSID });
        // 不复制原 domain，让宿主为当前域名创建 Cookie。
        Network.setCookies(origin + "/", [
            { name: "PHPSESSID", value: saved.PHPSESSID }
        ]);
    }

    checkAccountPage(doc) {
        if (doc.querySelector("#form-login") || doc.querySelector("input[name='password']") ||
            doc.querySelector(".header_login a[href='/login']")) {
            throw "Login expired: 请重新登录漫小肆";
        }
    }

    async postAccountForm(path, fields, origin = this.baseUrl, restore = true) {
        if (restore) this.restoreSessionCookies(origin);
        const body = Object.keys(fields).map(key =>
            `${encodeURIComponent(key)}=${encodeURIComponent(fields[key])}`).join("&");
        const res = await Network.post(this.siteUrl(path, origin), {
            ...this.requestHeaders,
            "Referer": origin + "/",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        }, body, { maskDataInLog: true, maskHeadersInLog: ["Cookie", "cookie"], maskResponseInLog: true });
        if (res.status === 401) throw "Login expired: HTTP 401，请重新登录漫小肆";
        if (res.status !== 200) throw `请求失败: ${res.status}`;
        let data;
        try {
            data = JSON.parse(res.body);
        } catch (_) {
            const doc = new HtmlDocument(res.body);
            try { this.checkAccountPage(doc); } finally { doc.dispose(); }
            throw "账号接口返回异常，可能遇到反爬验证，请尝试网页登录";
        }
        if (!data || typeof data !== "object" || String(data.err) !== "0") {
            throw data?.msg || "账号操作失败";
        }
        if (restore) this.captureSessionCookies(origin, false);
        return data;
    }

    // 原版 Venera 在注册源前解析 account，此处只能声明静态值和回调。
    account = {
        login: async (account, pwd) => {
            if (!account || !pwd) throw "请输入账号和密码";
            const origin = this.baseUrl;
            // 新登录必须使用独立会话，不能在验证码生成后恢复旧 Cookie。
            Network.deleteCookies(origin);
            const doc = await this.fetchDocument(`${origin}/login`, false);
            let captchaUrl;
            try {
                if (!doc.querySelector("#form-login")) throw "未找到登录表单，请尝试网页登录";
                captchaUrl = this.siteUrl(doc.querySelector("#captcha")?.attributes?.src, origin);
            } finally {
                doc.dispose();
            }
            captchaUrl += (captchaUrl.includes("?") ? "&" : "?") + "rnd=" + Date.now();
            const image = await Network.fetchBytes("GET", captchaUrl, { ...this.requestHeaders, "Referer": origin + "/" });
            if (image.status !== 200) throw `验证码加载失败: ${image.status}`;
            if (!image.body || !image.body.byteLength) throw "验证码图片为空，请重试";
            const contentType = image.headers?.["content-type"] || image.headers?.["Content-Type"];
            if (contentType && !String(contentType).toLowerCase().startsWith("image/")) {
                throw "验证码响应不是图片，可能遇到反爬验证，请尝试网页登录";
            }
            const captcha = await UI.showInputDialog("验证码", value =>
                value?.trim() ? null : "请输入验证码", image.body);
            if (typeof captcha !== "string" || !captcha.trim()) throw "已取消登录";
            await this.postAccountForm("/login", { username: account, password: pwd, captcha: captcha.trim() }, origin, false);
            this.captureSessionCookies(origin);
            return true;
        },
        loginWithWebview: {
            // 固定入口不读取设置；完成后将会话 Cookie 复用到所选域名。
            url: "https://www.mxshm.top/login",
            checkStatus: (url, title) => {
                // 网站登录成功后跳转 /ucenter；等待标题更新，避免在重定向前误判。
                if (typeof url !== "string" || typeof title !== "string" || !title.trim() ||
                    /登录|登入|login|验证码|安全验证|just a moment|checking your browser|access denied|错误|error|not found|404|403|forbidden/i.test(title)) return false;
                const match = url.match(/^(https?:\/\/[^/?#]+)\/ucenter\/?(?:[?#].*)?$/);
                if (!match || !this.settings.domains.options.some(domain => domain.value === match[1])) return false;
                this.webLoginOrigin = match[1];
                return true;
            },
            onLoginSuccess: () => {
                // 原版宿主先导入 WebView Cookie，再同步调用此回调。
                this.captureSessionCookies(this.webLoginOrigin || "https://www.mxshm.top");
                this.restoreSessionCookies(this.baseUrl);
            }
        },
        logout: () => {
            this.deleteData("sessionCookies");
            this.webLoginOrigin = null;
            for (const domain of this.settings.domains.options) Network.deleteCookies(domain.value);
            this.deleteData("account");
        }
    };

    favorites = {
        multiFolder: false,
        loadComics: async (page) => {
            if (!this.isLogged) throw "请先登录";
            const doc = await this.fetchDocument(`${this.baseUrl}/bookshelf?page=${page}`);
            try {
                this.checkAccountPage(doc);
                // user-booklist.js 通过 delfavors 和书架编辑按钮识别收藏列表。
                if (doc.querySelector("#url_param")?.attributes?.value !== "delfavors" &&
                    !doc.querySelector(".js_edit_booklist_btn")) {
                    throw "未找到书架列表，可能遇到反爬验证或页面结构已变化";
                }
                if (!doc.querySelector(".mh-list")) throw "未找到书架列表，页面结构可能已变化";
                const items = doc.querySelectorAll(".mh-list .mh-item");
                const comics = this.parseComicList(items);
                if (comics.length !== items.length) throw "书架漫画信息不完整，页面结构可能已变化";
                let maxPage = page;
                for (const link of doc.querySelectorAll(".pagination a[href*='page=']")) {
                    const match = link.attributes.href.match(/[?&]page=(\d+)/);
                    if (match) maxPage = Math.max(maxPage, parseInt(match[1]));
                }
                return { comics, maxPage };
            } finally {
                doc.dispose();
            }
        },
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            if (!this.isLogged) throw "请先登录";
            const doc = await this.fetchDocument(`${this.baseUrl}/book/${encodeURIComponent(comicId)}`);
            let current;
            try {
                this.checkAccountPage(doc);
                current = doc.querySelector("#addfavor")?.attributes?.["data-val"];
                if (current !== "0" && current !== "1") throw "无法读取漫画收藏状态";
            } finally {
                doc.dispose();
            }
            if ((current === "1") === isAdding) return true;
            const data = await this.postAccountForm("/addfavor", { book_id: comicId, val: current });
            if (String(data.isfavor) !== (isAdding ? "1" : "0")) throw "服务器返回的收藏状态与操作不符，请刷新后重试";
            return true;
        },
        singleFolderForSingleComic: true
    };

    // 解析普通漫画列表
    parseComicList(items) {
        const comics = [];
        
        for (let item of items) {
            // 提取漫画ID
            const linkElem = item.querySelector("a[href^='/book/']");
            const id = linkElem.attributes.href.split("/").pop();
            
            // 提取标题和作者
            const title = item.querySelector(".title a")?.text?.trim();
            const author = item.querySelector("span a")?.text?.trim();
            
            // 提取描述信息
            const description = item.querySelector(".chapter")?.text?.replace(/^更新/, "")?.replace(/\s+/g, " ")?.trim() || item.querySelector(".zl")?.text?.trim();

            // 验证必要字段并创建漫画对象
            if (id && title) {
                comics.push(new Comic({
                    id: id,
                    title: title,
                    subTitle: author,
                    cover: `${this.baseUrl}/static/upload/book/${id}/cover.jpg`,
                    description: description
                }));
            }
        }
        
        return comics;
    }

    // 解析热门漫画列表
    parseHotComicList(items) {
        const comics = [];
        
        for (let item of items) {
            // 提取漫画ID
            const linkElem = item.querySelector(".cover a[href^='/book/']");
            const id = linkElem.attributes.href.split("/").pop();
            
            // 提取标题、作者和点击量
            const title = item.querySelector(".info .title a")?.text?.trim();
            const author = item.querySelector(".info .desc")?.text?.trim();
            const clickCount = item.querySelector(".info .subtitle span a")?.text?.trim();

            // 提取标签信息
            const tags = [];
            const tagElems = item.querySelectorAll(".info .tag a");
            for (let tagElem of tagElems) {
                if (tagElem.text) tags.push(tagElem.text.trim());
            }

            // 验证必要字段并创建漫画对象
            if (id && title) {
                comics.push(new Comic({
                    id: id,
                    title: title,
                    subTitle: author,
                    cover: `${this.baseUrl}/static/upload/book/${id}/cover.jpg`,
                    tags: tags,
                    description: `热度: 🔥${clickCount}`
                }));
            }
        }
        
        return comics;
    }

    // 解析评论列表
    parseCommentList(items) {
        const comments = [];
        
        for (let item of items) {
            // 提取评论信息
            const userName = item.querySelector(".title")?.text?.trim();
            const content = item.querySelector(".content")?.text?.trim();
            const time = item.querySelector(".bottom")?.text?.match(/\d{4}-\d{2}-\d{2}/)?.[0]?.trim();
            const avatar = item.querySelector(".cover img")?.attributes?.src;

            // 验证必要字段并创建评论对象
            if (userName && content) {
                comments.push(new Comment({
                    userName: userName,
                    avatar: `${this.baseUrl}${avatar}`,
                    content: content,
                    time: time
                }));
            }
        }
        
        return comments;
    }

    // 执行网络请求并返回HTML文档对象
    async fetchDocument(url, restore = true) {
        if (restore) this.restoreSessionCookies(url);
        const res = await Network.get(url, this.requestHeaders);
        if (res.status === 401) throw "Login expired: HTTP 401，请重新登录漫小肆";
        
        if (res.status !== 200) {
            throw `请求失败: ${res.status}`;
        }
        
        const doc = new HtmlDocument(res.body);
        if (restore && this.isLogged && !doc.querySelector("#form-login") &&
            !doc.querySelector(".header_login a[href='/login']")) this.captureSessionCookies(url, false);
        return doc;
    }

    // === 探索页面配置 ===
    explore = [
        {
            title: "漫小肆",
            type: "multiPartPage",
            load: async (page) => {
                const doc = await this.fetchDocument(this.baseUrl);

                // 最近更新部分
                const updateSection = {
                    title: "最近更新",
                    comics: this.parseComicList(doc.querySelectorAll(".index-manga .mh-item")),
                    viewMore: {
                        page: "category",
                        attributes: { category: "最近更新" }
                    }
                };

                // 热门漫画部分
                const hotSection = {
                    title: "热门漫画",
                    comics: this.parseHotComicList(doc.querySelectorAll(".index-original .index-original-list li")),
                    viewMore: {
                        page: "category", 
                        attributes: { category: "排行榜" }
                    }
                };

                // 完结优选部分
                const endSection = {
                    title: "完结优选",
                    comics: this.parseComicList(doc.querySelectorAll(".box-body .mh-item")),
                    viewMore: {
                        page: "category",
                        attributes: { category: "全部漫画" }
                    }
                };

                doc.dispose();
                return [updateSection, hotSection, endSection];
            }
        }
    ];

    // === 分类页面配置 ===
    category = {
        title: "漫小肆",
        parts: [
            {
                name: "推荐",
                type: "fixed",
                categories: ["最近更新", "排行榜", "全部漫画"],
                itemType: "category"
            },
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "都市", "校园", "青春", "性感", "长腿", "多人", "御姐", "巨乳",
                    "新婚", "媳妇", "暧昧", "清纯", "调教", "少妇", "风骚", "同居", 
                    "淫乱", "好友", "女神", "诱惑", "偷情", "出轨", "正妹", "家教"
                ],
                itemType: "category"
            }
        ],
        enableRankingPage: false
    };

    // === 分类漫画加载配置 ===
    categoryComics = {
        // 加载分类漫画
        load: async (category, param, options, page) => {
            // 根据分类构建不同的请求URL
            let url;
            if (category === "最近更新") {
                url = `${this.baseUrl}/update?page=${page}`;
            } else if (category === "排行榜") {
                url = `${this.baseUrl}/rank`;
            } else {
                const tag = (category !== "全部漫画") ? category : "全部";
                const area = options[0] || "-1";
                const end = options[1] || "-1";
                url = `${this.baseUrl}/booklist?tag=${encodeURIComponent(tag)}&area=${area}&end=${end}&page=${page}`;
            }

            const doc = await this.fetchDocument(url);
            let comics = [];

            // 排行榜特殊处理
            if (category === "排行榜") {
                const selectedRank = options[0] || "new";
                const rankMapping = {
                    "new": "新书榜",
                    "popular": "人气榜", 
                    "end": "完结榜",
                    "recommend": "推荐榜"
                };

                // 查找对应的排行榜列表
                const rankLists = doc.querySelectorAll(".mh-list.col3.top-cat li");
                let targetList = null;

                for (let list of rankLists) {
                    const titleElem = list.querySelector(".title");
                    if (titleElem) {
                        const title = titleElem.text.trim();
                        if (title === rankMapping[selectedRank]) {
                            targetList = list;
                            break;
                        }
                    }
                }

                if (!targetList) {
                    doc.dispose();
                    throw "未找到对应的排行榜";
                }

                comics = this.parseComicList(targetList.querySelectorAll(".mh-item.horizontal, .mh-itme-top"));
            } else {
                // 普通分类处理
                comics = this.parseComicList(doc.querySelectorAll(".mh-list.col7 .mh-item"));
            }

            // 解析最大页数（排行榜不分页）
            let maxPage = 1;
            if (category !== "排行榜") {
                const pageLinks = doc.querySelectorAll(".pagination a[href*='page=']");
                for (let link of pageLinks) {
                    const match = link.attributes.href.match(/page=(\d+)/);
                    if (match) {
                        const pageNum = parseInt(match[1]);
                        if (!isNaN(pageNum) && pageNum > maxPage) {
                            maxPage = pageNum;
                        }
                    }
                }
            }

            doc.dispose();
            return { comics, maxPage };
        },

        // 动态加载分类选项
        optionLoader: async (category, param) => {
            if (category === "最近更新") {
                return [];
            } else if (category === "排行榜") {
                return [{
                    options: [
                        "new-新书榜",
                        "popular-人气榜", 
                        "end-完结榜",
                        "recommend-推荐榜"
                    ]
                }];
            } else {
                return [
                    {
                        label: "地区",
                        options: [
                            "-全部",
                            "1-韩国", 
                            "2-日本",
                            "3-台湾"
                        ]
                    },
                    {
                        label: "状态",
                        options: [
                            "-全部",
                            "0-连载",
                            "1-完结"
                        ]
                    }
                ];
            }
        }
    };

    // === 搜索功能配置 ===
    search = {
        // 搜索漫画
        load: async (keyword, options, page) => {
            const url = `${this.baseUrl}/search?keyword=${encodeURIComponent(keyword)}`;
            const doc = await this.fetchDocument(url);
            const comics = this.parseComicList(doc.querySelectorAll(".mh-item"));
            
            doc.dispose();
            return {
                comics: comics,
                maxPage: 1
            };
        },
        enableTagsSuggestions: false
    };

    // === 漫画详情和阅读功能配置 ===
    comic = {
        // 加载漫画详情
        loadInfo: async (id) => {
            const url = `${this.baseUrl}/book/${id}`;
            const doc = await this.fetchDocument(url);

            // 提取标题信息
            const title = doc.querySelector(".info h1")?.text?.trim();

            // 提取副标题信息（别名和作者）
            let author = "";
            let subTitle = "";
            const subTitleElems = doc.querySelectorAll(".info .subtitle");
            for (let elem of subTitleElems) {
                const text = elem.text;
                if (text.includes("别名：")) subTitle = text.replace("别名：", "").trim();
                if (text.includes("作者：")) author = text.replace("作者：", "").trim();
            }
            const authors = author ? author.split("&").map(a => a.trim()).filter(a => a) : [];

            // 提取其他信息（状态、地区、更新时间、点击量和描述信息）
            let status = "";
            let area = "";
            let updateTime = "";
            let clickCount = "";
            const tipElems = doc.querySelectorAll(".info .tip span");
            for (let elem of tipElems) {
                const text = elem.text;
                if (text.includes("状态：")) status = elem.querySelector("span")?.text?.trim();
                if (text.includes("地区：")) area = elem.querySelector("a")?.text?.trim();
                if (text.includes("更新时间：")) updateTime = elem.text.replace("更新时间：", "").trim();
                if (text.includes("点击：")) clickCount = elem.text.replace("点击：", "").trim();
            }
            const description = doc.querySelector(".info .content")?.text?.trim();

            // 提取标签信息
            const tagList = [];
            const tagElems = doc.querySelectorAll(".info .tip a[href*='tag=']");
            for (let elem of tagElems) {
                const tagName = elem.text?.trim();
                if (tagName) tagList.push(tagName);
            }

            // 提取章节列表
            const chapters = {};
            const chapterElems = doc.querySelectorAll("#detail-list-select li a");
            for (let elem of chapterElems) {
                const chapterUrl = elem.attributes?.href;
                const chapterTitle = elem.text?.trim();
                if (chapterUrl && chapterTitle) {
                    const chapterId = chapterUrl.split("/").pop();
                    if (chapterId) chapters[chapterId] = chapterTitle;
                }
            }

            // 提取评论和推荐漫画
            const comments = this.parseCommentList(doc.querySelectorAll(".view-comment-main .postlist li.dashed"));
            const recommend = this.parseComicList(doc.querySelectorAll(".index-manga .mh-item"));
            const isFavorite = doc.querySelector("#addfavor")?.attributes?.["data-val"] === "1";

            doc.dispose();
            
            // 创建并返回漫画详情对象
            return new ComicDetails({
                title: title,
                subTitle: subTitle,
                cover: `${this.baseUrl}/static/upload/book/${id}/cover.jpg`,
                description: description,
                tags: {
                    "作者": authors,
                    "题材": tagList,
                    "地区": [area],
                    "状态": [status],
                    "热度": [`🔥${clickCount}`]
                },
                chapters: chapters,
                recommend: recommend,
                commentCount: comments.length,
                updateTime: updateTime,
                url: url,
                comments: comments,
                isFavorite: isFavorite
            });
        },

        // 加载章节图片
        loadEp: async (comicId, epId) => {
            const url = `${this.baseUrl}/chapter/${epId}`;
            const doc = await this.fetchDocument(url);

            // 提取懒加载图片
            const images = [];
            const imageElems = doc.querySelectorAll("img.lazy");
            for (let img of imageElems) {
                const src = img.attributes?.["data-original"];
                const image = src.replace(/https?:\/\/[^\/]+/, this.baseUrl);
                if (image) images.push(image);
            }

            if (images.length === 0) {
                doc.dispose();
                throw "本章中未找到图片";
            }

            doc.dispose();
            return {
                images: images
            };
        },

        // 加载评论列表
        loadComments: async (comicId, subId, page, replyTo) => {
            const url = `${this.baseUrl}/book/${comicId}`;
            const doc = await this.fetchDocument(url);

            const comments = this.parseCommentList(doc.querySelectorAll(".view-comment-main .postlist li.dashed"));

            doc.dispose();
            return {
                comments: comments,
                maxPage: 1
            };
        },

        // 处理标签点击事件
        onClickTag: (namespace, tag) => {
            // 作者标签跳转到搜索页面
            if (namespace === "作者") {
                return {
                    page: "search",
                    attributes: {
                        keyword: tag
                    }
                };
            }
            // 题材标签跳转到分类页面
            else if (namespace === "题材") {
                return {
                    page: "category",
                    attributes: {
                        category: tag
                    }
                };
            }
        },
        enableTagsTranslate: false
    };
}
