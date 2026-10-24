class Wnacg extends ComicSource {
    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "紳士漫畫"

    // unique id of the source
    key = "wnacg"

    version = "1.0.12"

    minAppVersion = "1.0.0"

    // update url
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/wnacg.js"

    static domains = [];

    get domains() {
        let saved = this.loadData('domains')
        let domains = Array.isArray(saved) ? saved : Wnacg.domains
        return domains.filter(domain => !this.isPublicationDomain(domain))
    }

    isPublicationDomain(domain) {
        return /^(?:www\.)?wn(?:acg)?\d+\.link$/i.test(domain)
    }

    contentDomain(domain) {
        domain = domain.trim()
        // This site's bare host redirects POSTs to www. Use one cookie origin.
        return /^(?:wn003\.cfd|wnacg\.com)$/i.test(domain) ? `www.${domain.toLowerCase()}` : domain
    }

    get baseUrl() {
        let selection = this.loadSetting('domainSelection')
        if (selection === undefined || selection === null) selection = 0
        selection = parseInt(selection)

        if (selection === 0) {
            // 选择自定义域名
            let domain0 = this.loadSetting('domain0')
            if (!domain0 || domain0.trim() === '') {
                throw 'Custom domain is not set'
            }
            return `https://${this.contentDomain(domain0)}`
        } else {
            // 选择获取的域名 (Domain 1-3)
            let index = selection - 1
            let domain = this.domains[index]
            // Old selections may outlive the fetched list. Keep the custom URL usable.
            if (!domain) domain = this.loadSetting('domain0')
            if (!domain || !domain.trim()) throw 'Selected domain is unavailable'
            return `https://${this.contentDomain(domain)}`
        }
    }

    get accountBaseUrl() {
        // Keep browser cookies on their original host, even when public browsing
        // uses a custom mirror. Never copy session/clearance cookies across sites.
        return this.loadData('webLoginOrigin') === 'https://www.wnacg.com'
            ? 'https://www.wnacg.com' : this.baseUrl
    }

    _webLoginReady = false

    overwriteDomains(domains) {
        if (domains.length != 0) {
            Wnacg.domains = domains.slice(0, 3)
            this.saveData('domains', Wnacg.domains)
        }
    }

    // [Optional] account related
    account = {
        /**
         * login, return any value to indicate success
         * @param account {string}
         * @param pwd {string}
         * @returns {Promise<any>}
         */
        login: async (account, pwd) => {
            let res = await Network.post(
                `${this.baseUrl}/users-check_login.html`,
                {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Origin': this.baseUrl,
                    'Referer': `${this.baseUrl}/users-login.html?ajax=true`,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                `login_name=${encodeURIComponent(account)}&login_pass=${encodeURIComponent(pwd)}`,
                { maskDataInLog: true, maskResponseInLog: true, maskHeadersInLog: ['Cookie', 'cookie'] }
            )
            this.checkChallenge('', res.headers)
            if (res.status !== 200) {
                throw `Login failed: Invalid Status Code ${res.status}`
            }
            let body = this.responseText(res.body)
            this.checkChallenge(body)
            let json
            try { json = JSON.parse(body) }
            catch (e) { throw 'Login failed: invalid JSON response' }
            if (!json || typeof json !== 'object' || !Object.prototype.hasOwnProperty.call(json, 'ret')) {
                throw 'Login failed: response is missing ret'
            }
            // Match the site's AJAX protocol, independently of its UI wording.
            if (json.ret === true || json.ret === 1 || json.ret === '1') {
                this.deleteData('webLoginOrigin')
                this._webLoginReady = false
                return 'ok'
            }
            let message = typeof json.html === 'string' ? json.html : ''
            message = message.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, ' ')
            for (let value of [account, pwd]) {
                if (value) message = message.replaceAll(value, '[redacted]')
            }
            message = message.replace(/\s+/g, ' ').trim().slice(0, 180)
            if (/滑[塊块]|人[機机][驗验][證证]|slider_pass|captcha/i.test(message)) {
                throw 'Login failed: 網站需要滑塊驗證，請使用「網頁登入」完成驗證，登入後打開「我的收藏」'
            }
            throw `Login failed${message ? ': ' + message : ': credentials rejected'}`
        },

        loginWithWebview: {
            // Native Venera reads this before source settings are available.
            // The complete document loads the site's official slider UI.
            url: 'https://www.wnacg.com/users-login.html',
            checkStatus: (url, title) => {
                this._webLoginReady = false
                if (typeof url !== 'string' || typeof title !== 'string') return false
                // Anonymous private URLs also return HTTP 200. A login, challenge
                // or permission page must never close the browser as a success.
                if (!/^https:\/\/www\.wnacg\.com\/users-(?:users_fav|index)\.html(?:\?[^#]*)?$/.test(url) ||
                    !/(?:紳士漫畫|绅士漫画)/.test(title) ||
                    !/我的空间|我的空間/.test(title) ||
                    /登[錄录入]|login|sign\s*in|註冊|注册|register|滑[塊块]|驗證|验证|captcha|challenge|just a moment|cloudflare|checking|權限|权限|錯誤|错误|error|forbidden|denied|not found|\b40[134]\b/i.test(title)) return false
                this._webLoginReady = true
                return true
            },
            onLoginSuccess: () => {
                // The native host imports cookies before this synchronous callback;
                // it does not await promises. Cookie presence is a bridge check,
                // not proof of authentication; favorites still validate the server.
                try {
                    if (!this._webLoginReady) throw '請完成網頁登入後打開「我的收藏」'
                    let cookies = Network.getCookies('https://www.wnacg.com')
                    if (!Array.isArray(cookies) || !cookies.some(cookie => cookie &&
                        typeof cookie.name === 'string' && cookie.name.trim() &&
                        typeof cookie.value === 'string' && cookie.value.trim())) {
                        throw '未取得網頁登入 Cookie，請重新登入'
                    }
                    this.saveData('webLoginOrigin', 'https://www.wnacg.com')
                    this.deleteData('_localStorage')
                } finally { this._webLoginReady = false }
            },
        },

        /**
         * logout function, clear account related data
         */
        logout: () => {
            let origins = new Set([this.accountBaseUrl, this.baseUrl, 'https://www.wnacg.com'])
            for (let origin of origins) Network.deleteCookies(origin)
            this.deleteData('webLoginOrigin')
            this.deleteData('_localStorage')
            this.deleteData('account')
            this._webLoginReady = false
        },

        // {string?} - register url
        registerWebsite: null
    }

    async init() {
        let selection = Number(this.loadSetting('domainSelection') || 0)
        // A custom domain must not depend on the address publication site.
        if (selection >= 1 && selection <= 3 && this.loadSetting('refreshDomainsOnStart')) {
            await this.refreshDomains(false)
        }
    }

    /**
     * 刷新域名列表
     * @param showConfirmDialog {boolean}
     */
    async refreshDomains(showConfirmDialog) {
        let url = "https://wn01.link/"
        let title = ""
        let message = ""
        let domains = []
        let failure = 'No domain links found'

        try {
            let res = await Network.get(url, { 'cache-time': 'no' })
            this.checkChallenge('', res.headers)
            if (res.status == 200) {
                let html = this.responseText(res.body)
                this.checkChallenge(html)
                let document = new HtmlDocument(html)
                // 提取所有链接
                let links = document.querySelectorAll("a[href]")
                let seenDomains = new Set()

                for (let link of links) {
                    let href = link.attributes["href"]
                    if (!href) continue

                    // 提取域名（支持 http:// 和 https://）
                    let match = href.match(/^https?:\/\/([^\/]+)/)
                    if (match) {
                        let domain = match[1]
                        // 只提取有效的域名，排除 wn01.link 自身和其他无关链接
                        if (domain &&
                            domain.includes(".") &&
                            !domain.includes("wn01.link") &&
                            !this.isPublicationDomain(domain) &&
                            !domain.includes("google.cn") &&
                            !domain.includes("cdn-cgi") &&
                            !seenDomains.has(domain)) {
                            domains.push(domain)
                            seenDomains.add(domain)
                        }
                    }
                }
                document.dispose()

                if (domains.length > 0) {
                    title = "Update Success"
                    message = "Fetched: \n\n"
                }
            } else failure = `Invalid Status Code ${res.status}`
        } catch (e) {
            if (!showConfirmDialog) throw e
            failure = String(e)
        }

        if (domains.length == 0) {
            if (!showConfirmDialog) throw `Failed to refresh domain list: ${failure}`
            title = "Update Failed"
            message = `Could not fetch domains: ${failure}\nKeeping the saved list.\n\n`
            domains = this.domains
        }

        for (let i = 0; i < domains.length; i++) {
            message = message + `URL ${i + 1}: ${domains[i]}\n`
        }
        message = message + `\n Total: ${domains.length} URLs\n\n Re-enter page to refresh`

        if (showConfirmDialog) {
            UI.showDialog(
                title,
                message,
                [
                    {
                        text: "Cancel",
                        callback: () => { }
                    },
                    {
                        text: "Apply",
                        callback: () => this.overwriteDomains(domains)
                    }
                ]
            )
        } else {
            this.overwriteDomains(domains)
        }
    }

    absoluteUrl(value, base = this.baseUrl) {
        value = String(value || '').trim()
        if (/^https?:\/\//i.test(value)) return value
        // The site's detail cover currently starts with four slashes.
        if (/^\/{2,}/.test(value)) return 'https://' + value.replace(/^\/+/, '')
        if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) throw 'Invalid image or link URL'
        return base + (value.startsWith('/') ? '' : '/') + value
    }

    responseText(body) {
        if (typeof body === 'string') return body
        if (body === undefined || body === null) throw 'Invalid empty response body'
        // Native Venera can return bytes from its shared GET cache even for get().
        return Convert.decodeUtf8(body)
    }

    checkChallenge(body, headers = {}) {
        let challenged = Object.entries(headers || {}).some(([name, value]) =>
            name.toLowerCase() === 'cf-mitigated' && String(value).toLowerCase().includes('challenge'))
        if (challenged || /cf-chl-|challenge-platform|<title>\s*Just a moment/i.test(body)) {
            throw 'Cloudflare challenge: open the site in a browser'
        }
    }

    async getPage(url, headers = {}) {
        let res = await Network.get(url, headers)
        this.checkChallenge('', res.headers)
        if (res.status !== 200) throw `Invalid Status Code ${res.status}`
        let body = this.responseText(res.body)
        this.checkChallenge(body)
        return body
    }

    maxPage(document, current = 1) {
        let pages = current
        for (let e of document.querySelectorAll('div.f_left.paginator a, div.f_left.paginator span.thispage')) {
            let text = e.text.trim()
            if (/^\d+$/.test(text)) pages = Math.max(pages, Number(text))
            let match = (e.attributes.href || '').match(/(?:-page-|[?&]p=)(\d+)/)
            if (match) pages = Math.max(pages, Number(match[1]))
        }
        return pages
    }

    chapterLinks(document) {
        let chapters = new Map()
        for (let e of document.querySelectorAll('a.tagshow')) {
            let match = (e.attributes.href || '').match(/-aid-(\d+)/)
            let id = e.attributes['data-chid'] || (match && match[1])
            if (id && /^\d+$/.test(id) && e.text.trim()) chapters.set(String(id), e.text.trim())
        }
        return chapters
    }

    checkFavoriteSession(document) {
        if (document.querySelector('form#login_form, input[name="login_name"]')) throw 'Login expired'
        let notice = document.querySelector('#center_box .title.title_c')
        if (notice && /(?:[沒没]有[權权]限|需要登[錄录入])/.test(notice.text)) throw 'Login expired'
    }

    favoriteFolders(document) {
        this.checkFavoriteSession(document)
        let folders = {}
        for (let e of document.querySelectorAll('a[href]')) {
            let match = (e.attributes.href || '').trim().match(/\/users-users_fav-c-(\d+)\.html$/)
            if (match && e.text.trim() && folders[match[1]] === undefined) folders[match[1]] = e.text.trim()
        }
        if (!Object.keys(folders).length && !document.querySelector('a[href*="favclass"]')) {
            throw 'Invalid favorites folder page'
        }
        folders['0'] = this.translate('All')
        return folders
    }

    async findFavorite(comicId, folderId) {
        let page = 1, maxPage = 1
        do {
            let result = await this.favorites.loadComics(page, folderId)
            let found = result.comics.find(comic => comic.id === String(comicId))
            if (found) return found
            maxPage = result.maxPage
            page++
        } while (page <= maxPage)
        return null
    }

    parseComic(c) {
        let link = c.querySelector("div.pic_box > a").attributes["href"];
        let id = RegExp("(?<=-aid-)[0-9]+").exec(link)[0];
        let image = this.absoluteUrl(c.querySelector("div.pic_box > a > img").attributes["src"]);
        let name = c.querySelector("div.info > div.title > a").text;
        let info = c.querySelector("div.info > div.info_col").text.trim();
        info = info.replaceAll('\n', '');
        info = info.replaceAll('\t', '');
        return new Comic({
            id: id,
            title: name,
            cover: image,
            description: info,
        })
    }

    // explore page list
    explore = [
        {
            // title of the page.
            // title is used to identify the page, it should be unique
            title: "紳士漫畫",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPartPage",

            /**
             * load function
             * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
             * @returns {{}}
             * - for `multiPartPage` type, return [{title: string, comics: Comic[], viewMore: string?}]
             * - for `multiPageComicList` type, for each page(1-based), return {comics: Comic[], maxPage: number}
             * - for `mixed` type, use param `page` as index. for each index(0-based), return {data: [], maxPage: number?}, data is an array contains Comic[] or {title: string, comics: Comic[], viewMore: string?}
             */
            load: async (page) => {
                let document = new HtmlDocument(await this.getPage(this.baseUrl))
                let titleBlocks = document.querySelectorAll("div.title_sort");
                let comicBlocks = document.querySelectorAll("div.bodywrap");
                if (!titleBlocks.length || titleBlocks.length !== comicBlocks.length) {
                    throw "Invalid Page"
                }
                let result = []
                for (let i = 0; i < titleBlocks.length; i++) {
                    let title = titleBlocks[i].querySelector("div.title_h2").text.replaceAll(/\s+/g, '')
                    let link = titleBlocks[i].querySelector("div.r > a").attributes["href"]
                    let comics = []
                    let comicBlock = comicBlocks[i]
                    let comicElements = comicBlock.querySelectorAll("div.gallary_wrap > ul.cc > li")
                    for (let comicElement of comicElements) {
                        comics.push(this.parseComic(comicElement))
                    }
                    result.push({
                        title: title,
                        comics: comics,
                        viewMore: `category:${title}@${link}`
                    })
                }
                document.dispose()
                return result
            }
        }
    ]

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "紳士漫畫",
        parts: [
            {
                // title of the part
                name: "最新",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["最新"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: ["/albums.html"],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "同人誌",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["同人誌", "漢化", "日語", "English", "CG畫集", "3D漫畫", "寫真Cosplay"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-5.html",
                    "/albums-index-cate-1.html",
                    "/albums-index-cate-12.html",
                    "/albums-index-cate-16.html",
                    "/albums-index-cate-2.html",
                    "/albums-index-cate-22.html",
                    "/albums-index-cate-3.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "單行本",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["單行本", "漢化", "日語", "English",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-6.html",
                    "/albums-index-cate-9.html",
                    "/albums-index-cate-13.html",
                    "/albums-index-cate-17.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "雜誌短篇",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["雜誌短篇", "漢化", "日語", "English",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-7.html",
                    "/albums-index-cate-10.html",
                    "/albums-index-cate-14.html",
                    "/albums-index-cate-18.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "韓漫",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["韓漫", "漢化", "生肉",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-19.html",
                    "/albums-index-cate-20.html",
                    "/albums-index-cate-21.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
        ],
        // enable ranking page
        enableRankingPage: true,
    }

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
            let path = param
            if (page !== 0) {
                if (!path.includes("-")) {
                    path = path.replaceAll(".html", "-.html");
                }
                path = path.replaceAll("index", "");
                let lr = path.split("albums-");
                lr[1] = `index-page-${page}${lr[1]}`;
                path = `${lr[0]}albums-${lr[1]}`;
            }

            let url = this.baseUrl + path
            let document = new HtmlDocument(await this.getPage(url))
            let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
            let comics = []
            for (let comicElement of comicElements) {
                comics.push(this.parseComic(comicElement))
            }
            let pages = this.maxPage(document, Math.max(page, 1))
            document.dispose()
            return {
                comics: comics,
                maxPage: pages,
            }
        },
        ranking: {
            options: [
                "day-Day",
                "week-Week",
                "month-Month",
            ],
            load: async (option, page) => {
                let url = `${this.baseUrl}/albums-favorite_ranking-type-${option}.html`
                if (page !== 0) {
                    url = `${this.baseUrl}/albums-favorite_ranking-page-${page}-type-${option}.html`
                }

                let document = new HtmlDocument(await this.getPage(url))
                let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
                let comics = []
                for (let comicElement of comicElements) {
                    comics.push(this.parseComic(comicElement))
                }

                let pages = this.maxPage(document, Math.max(page, 1))

                document.dispose()
                return {
                    comics: comics,
                    maxPage: pages,
                }
            }
        }
    }

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
            let url = `${this.baseUrl}/search/?q=${encodeURIComponent(keyword)}&f=_all&s=create_time_DESC&syn=yes`
            if (page !== 0) {
                url += `&p=${page}`
            }
            let document = new HtmlDocument(await this.getPage(url))
            let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
            let comics = []
            for (let comicElement of comicElements) {
                comics.push(this.parseComic(comicElement))
            }
            let count = document.querySelector("p.result > b")
            if (!count) { document.dispose(); throw 'Invalid search page' }
            let total = count.text.replaceAll(',', '').trim()
            if (!/^\d+$/.test(total)) { document.dispose(); throw 'Invalid search count' }
            const comicsPerPage = 24
            let pages = Math.ceil(Number(total) / comicsPerPage)
            document.dispose()
            return {
                comics: comics,
                maxPage: pages,
            }
        },
    }

    // favorite related
    favorites = {
        // whether support multi folders
        multiFolder: true,
        singleFolderForSingleComic: true,
        isOldToNewSort: true,
        /**
         * add or delete favorite.
         * throw `Login expired` to indicate login expired, App will automatically re-login and re-add/delete favorite
         * @param comicId {string}
         * @param folderId {string}
         * @param isAdding {boolean} - true for add, false for delete
         * @param favoriteId {string?} - [Comic.favoriteId]
         * @returns {Promise<any>} - return any value to indicate success
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            if (isAdding && (!folderId || String(folderId) === '0')) {
                throw 'All is a collection view; select a specific favorite folder'
            }
            if (!isAdding) {
                if (!favoriteId) {
                    let found = await this.findFavorite(comicId, folderId)
                    if (!found) return 'ok'
                    favoriteId = found.favoriteId
                }
                let res = await Network.get(`${this.accountBaseUrl}/users-fav_del-id-${favoriteId}.html?ajax=true&_t=${randomDouble(0, 1)}`, { 'cache-time': 'no' })
                if (res.status !== 200) {
                    throw 'Delete failed'
                }
            } else {
                let res = await Network.post(`${this.accountBaseUrl}/users-save_fav-id-${comicId}.html`, {
                    'content-type': 'application/x-www-form-urlencoded'
                }, `favc_id=${folderId}`)
                if (res.status !== 200) {
                    throw 'Delete failed'
                }
            }
            return 'ok'
        },
        /**
         * load favorite folders.
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * if comicId is not null, return favorite folders which contains the comic.
         * @param comicId {string?}
         * @returns {Promise<{folders: {[p: string]: string}, favorited: string[]}>} - `folders` is a map of folder id to folder name, `favorited` is a list of folder id which contains the comic
         */
        loadFolders: async (comicId) => {
            let document = new HtmlDocument(await this.getPage(`${this.accountBaseUrl}/users-users_fav.html`, { 'cache-time': 'no' }))
            let folders
            try { folders = this.favoriteFolders(document) }
            finally { document.dispose() }
            if (comicId === undefined || comicId === null || comicId === '') return { folders: folders, favorited: [] }

            let popup = new HtmlDocument(await this.getPage(`${this.accountBaseUrl}/users-addfav-id-${comicId}.html`, { 'cache-time': 'no' }))
            try {
                this.checkFavoriteSession(popup)
                if (popup.querySelector('form select[name="favc_id"]')) return { folders: folders, favorited: [] }
                let notice = popup.querySelector('div.box_container')
                if (!notice || !/已[經经]收藏/.test(notice.text)) throw 'Invalid favorite status response'
                // The popup confirms membership, but does not identify a folder.
                // All contains every favorite. Venera calls this on every detail
                // open, so never scan shelves to resolve a specific folder here.
                return { folders: folders, favorited: ['0'] }
            } finally { popup.dispose() }
        },
        /**
         * add a folder
         * @param name {string}
         * @returns {Promise<any>} - return any value to indicate success
         */
        addFolder: async (name) => {
            let res = await Network.post(`${this.accountBaseUrl}/users-favc_save-id.html`, {
                'content-type': 'application/x-www-form-urlencoded'
            }, `favc_name=${encodeURIComponent(name)}`)
            if (res.status !== 200) {
                throw 'Add failed'
            }
            return 'ok'
        },
        /**
         * delete a folder
         * @param folderId {string}
         * @returns {Promise<void>} - return any value to indicate success
         */
        deleteFolder: async (folderId) => {
            if (!folderId || String(folderId) === '0') throw 'Cannot delete the All collection view'
            let res = await Network.get(`${this.accountBaseUrl}/users-favclass_del-id-${folderId}.html?ajax=true&_t=${randomDouble()}`, {})
            if (res.status !== 200) {
                throw 'Delete failed'
            }
            return 'ok'
        },
        /**
         * load comics in a folder
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * @param page {number}
         * @param folder {string?} - folder id, null for non-multi-folder
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        loadComics: async (page, folder) => {
            let url = `${this.accountBaseUrl}/users-users_fav-page-${page}-c-${folder || '0'}.html`
            let document = new HtmlDocument(await this.getPage(url, { 'cache-time': 'no' }))
            try {
                this.checkFavoriteSession(document)
                let comicBlocks = document.querySelectorAll("div.asTB")
                if (!comicBlocks.length) this.favoriteFolders(document)
                let comics = comicBlocks.map((comic) => {
                    let cover = comic.querySelector('div.asTBcell.thumb img')
                    let title = comic.querySelector('div.box_cel.u_listcon > p.l_title > a')
                    let id = (title && title.attributes.href || '').match(/-aid-(\d+)/)
                    let remove = comic.querySelector('div.box_cel.u_listcon > p.alopt > a')
                    let favoriteId = remove && ((remove.attributes.onclick || '') + ' ' + (remove.attributes.href || '')).match(/fav_del-id-(\d+)/)
                    if (!cover || !title || !title.text.trim() || !id || !favoriteId) throw 'Invalid favorite comic row'
                    let time = comic.querySelector('div.box_cel.u_listcon > p.l_catg > span')
                    let metadata = comic.querySelector('div.box_cel.u_listcon > p.l_detla')
                    let info = metadata ? metadata.text.trim() : ''
                    let pages = info.match(/[頁页][數数]\s*[：:]\s*(\d+)/)
                    return new Comic({
                        id: id[1],
                        title: title.text.trim(),
                        subtitle: time ? time.text.replaceAll('創建時間：', '').trim() : '',
                        cover: this.absoluteUrl(cover.attributes.src, this.accountBaseUrl),
                        description: info,
                        maxPage: pages ? Number(pages[1]) : undefined,
                        favoriteId: favoriteId[1],
                    })
                })
                let pages = this.maxPage(document, Math.max(page, 1))
                return {
                    comics: comics,
                    maxPage: pages,
                }
            } finally { document.dispose() }
        }
    }

    /// single comic related
    comic = {
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            let document = new HtmlDocument(await this.getPage(`${this.baseUrl}/photos-index-page-1-aid-${id}.html`))
            try {
                let title = document.querySelector('div.userwrap > h2')
                let cover = document.querySelector('div.asTBcell.uwthumb > img')
                if (!title || !cover) throw 'Invalid comic detail page'
                let labels = {}
                for (let e of document.querySelectorAll('div.asTBcell.uwconn > label')) {
                    let match = e.text.match(/^\s*([^：:]+)[：:]\s*(.*)$/)
                    if (match) labels[match[1].trim()] = match[2].trim()
                }
                let chapters = this.chapterLinks(document)
                let collection = document.querySelector('#sr_pub')
                if (collection) {
                    let total = Number(collection.attributes['data-total'])
                    let perPage = Number(collection.attributes['data-per'])
                    let template = collection.attributes['data-pageurl'] || ''
                    if (total > 0 && !chapters.size) throw 'Incomplete collection chapter list'
                    if (total > chapters.size) {
                        if (!(perPage > 0) || !/(?:\[#page#\]|%5b%23page%23%5d)/i.test(template)) {
                            throw 'Incomplete collection chapter list: missing pagination'
                        }
                        for (let page = 2; page <= Math.ceil(total / perPage); page++) {
                            let link = template.replace(/\[#page#\]|%5b%23page%23%5d/ig, String(page))
                            let more = new HtmlDocument(await this.getPage(this.absoluteUrl(link)))
                            try {
                                for (let [key, value] of this.chapterLinks(more)) chapters.set(key, value)
                            } finally { more.dispose() }
                        }
                        if (chapters.size !== total) throw 'Incomplete collection chapter list'
                    }
                }
                let tags = new Map()
                for (let name of ['頁數', '章節', '分類']) {
                    if (labels[name]) tags.set(name, [labels[name]])
                }
                let tagList = document.querySelectorAll('a.tagshow').filter(e =>
                    !e.attributes['data-chid'] && !/-aid-\d+/.test(e.attributes.href || '')
                ).map(e => e.text.trim()).filter(Boolean)
                if (tagList.length) tags.set('標籤', tagList)
                let description = document.querySelector('div.asTBcell.uwconn > p')
                let uploader = document.querySelector('div.asTBcell.uwuinfo > a > p')
                return new ComicDetails({
                    title: title.text.trim(),
                    cover: this.absoluteUrl(cover.attributes.src),
                    tags: tags,
                    chapters: chapters.size ? chapters : undefined,
                    description: description ? description.text.trim() : '',
                    uploader: uploader ? uploader.text.trim() : '',
                    url: `${this.baseUrl}/photos-index-page-1-aid-${id}.html`,
                })
            } finally {
                document.dispose()
            }
        },
        /**
         * [Optional] load thumbnails of a comic
         * @param id {string}
         * @param next {string | null | undefined} - next page token, null for first page
         * @returns {Promise<{thumbnails: string[], next: string?}>} - `next` is next page token, null for no more
         */
        loadThumbnails: async (id, next) => {
            let target = String(id), page = 1
            if (next) {
                let token = String(next).match(/^(\d+):(\d+)$/)
                if (token) { target = token[1]; page = Number(token[2]) }
                else if (/^\d+$/.test(String(next))) page = Number(next)
                else throw 'Invalid thumbnail page token'
            }
            let document = new HtmlDocument(await this.getPage(`${this.baseUrl}/photos-index-page-${page}-aid-${target}.html`))
            try {
                let thumbnails = document.querySelectorAll('div.pic_box.tb > a > img').map(e => this.absoluteUrl(e.attributes.src))
                if (!thumbnails.length) {
                    // Collections have chapters instead of their own thumbnail grid.
                    let firstChapter = this.chapterLinks(document).keys().next().value
                    if (firstChapter && firstChapter !== target && page === 1) {
                        return await this.comic.loadThumbnails(firstChapter, null)
                    }
                    throw 'No thumbnails found on comic page'
                }
                return {
                    thumbnails: thumbnails,
                    next: page < this.maxPage(document, page) ? `${target}:${page + 1}` : null,
                }
            } finally {
                document.dispose()
            }
        },
        /**
         * load images of a chapter
         * @param comicId {string}
         * @param epId {string?}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            let target = epId || comicId
            let body = await this.getPage(`${this.baseUrl}/photos-gallery-aid-${target}.html`)
            // Decode only string literals. Never execute the site's JavaScript.
            let parseString = value => JSON.parse(value.replace(/[\u0000-\u001f]/g,
                c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')))
            let lines = Array.from(body.matchAll(/document\.writeln\(("(?:\\.|[^"\\])*")\);/g))
            if (lines.length) body = lines.map(m => parseString(m[1])).join('\n')
            let list = body.match(/\bimglist\s*=\s*(\[[\s\S]*?\]);/)
            if (!list) throw 'Invalid gallery image list'
            let host = body.match(/\bfast_img_host\s*=\s*("(?:\\.|[^"\\])*")/)
            host = host ? parseString(host[1]) : ''
            let images = []
            for (let m of list[1].matchAll(/\burl\s*:\s*(fast_img_host\s*\+\s*)?("(?:\\.|[^"\\])*")/g)) {
                let value = parseString(m[2])
                if (value.replace(/[?#].*$/, '') === '/themes/weitu/images/bg/shoucang.jpg') continue
                images.push(this.absoluteUrl((m[1] ? host : '') + value))
            }
            if (!images.length) throw 'No reading images found in gallery'
            return { images: images }
        },
        /**
         * [Optional] Handle tag click event
         * @param namespace {string}
         * @param tag {string}
         * @returns {{action: string, keyword: string, param: string?}}
         */
        onClickTag: (namespace, tag) => {
            return {
                action: 'search',
                keyword: tag,
            }
        },
    }

    get settings() {
        // Venera reads settings once, before init. Keep persisted choices stable.
        let domainOptions = [
            { value: '0', text: 'Custom Domain' },
            { value: '1', text: 'Domain 1' },
            { value: '2', text: 'Domain 2' },
            { value: '3', text: 'Domain 3' },
        ]

        return {
            refreshDomains: {
                title: "Refresh Domain List",
                type: "callback",
                buttonText: "Refresh",
                callback: () => this.refreshDomains(true)
            },
            refreshDomainsOnStart: {
                title: "Refresh Domain List on Startup",
                type: "switch",
                default: true,
            },
            domainSelection: {
                title: "Domain Selection",
                type: "select",
                options: domainOptions,
                default: "0",
            },
            domain0: {
                title: "Custom Domain",
                type: "input",
                validator: String.raw`^(?!:\/\/)(?=.{1,253})([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`,
                default: 'www.wnacg.com',
            },
        }
    }

    translation = {
        'zh_CN': {
            'All': '全部',
            'All is a collection view; select a specific favorite folder': '全部是汇总视图，请选择具体收藏夹',
            'Cannot delete the All collection view': '不能删除全部收藏汇总视图',
            'Refresh Domain List': '刷新域名列表',
            'Refresh': '刷新',
            'Refresh Domain List on Startup': '启动时刷新域名列表',
            'Domain Selection': '域名选择',
            'Custom Domain': '自定义域名',
            'Custom domain is not set': '未设置自定义域名',
            'Selected domain is unavailable': '所选域名不可用，请先刷新域名列表',
            'Day': '日',
            'Week': '周',
            'Month': '月',
        },
        'zh_TW': {
            'All': '全部',
            'All is a collection view; select a specific favorite folder': '全部是彙總檢視，請選擇具體收藏夾',
            'Cannot delete the All collection view': '不能刪除全部收藏彙總檢視',
            'Refresh Domain List': '刷新域名列表',
            'Refresh': '刷新',
            'Refresh Domain List on Startup': '啟動時刷新域名列表',
            'Domain Selection': '域名選擇',
            'Custom Domain': '自定義域名',
            'Custom domain is not set': '未設置自定義域名',
            'Selected domain is unavailable': '所選域名不可用，請先刷新域名列表',
            'Day': '日',
            'Week': '周',
            'Month': '月',
        },
    }
}
