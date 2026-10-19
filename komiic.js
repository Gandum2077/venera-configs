class Komiic extends ComicSource {

    // 此漫画源的名称
    name = "Komiic"

    // 唯一标识符
    key = "Komiic"

    version = "1.0.4"

    minAppVersion = "1.0.0"

    // 更新链接
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/komiic.js"

    get headers() {
        return {
            'Referer': 'https://komiic.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Content-Type': 'application/json'
        }
    }

    async refreshSession() {
        // Share a single refresh when parallel detail requests find an expired cookie.
        if (!this._refreshRequest) {
            this._refreshRequest = (async () => {
                const res = await Network.post('https://komiic.com/auth/refresh', this.headers, {})
                if (res.status !== 200) {
                    throw new Error(`Authentication expired; please log in again (HTTP ${res.status})`)
                }
            })()
        }
        const pending = this._refreshRequest
        try {
            await pending
        } finally {
            if (this._refreshRequest === pending) this._refreshRequest = null
        }
    }

    async queryJson(query, retryAuth = true) {
        let res = await Network.post(
            'https://komiic.com/api/query',
            this.headers,
            query
        )

        if (res.status === 401 && retryAuth) {
            await this.refreshSession()
            return this.queryJson(query, false)
        }
        if (res.status !== 200) {
            throw new Error(`Komiic HTTP ${res.status}`)
        }
        let json
        try {
            json = JSON.parse(res.body)
        } catch (_) {
            throw new Error('Komiic returned invalid JSON; check network or browser verification')
        }
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            throw new Error('Invalid Komiic GraphQL response')
        }
        if (json.errors !== undefined && !Array.isArray(json.errors)) {
            throw new Error('Invalid Komiic GraphQL errors')
        }
        if (json.errors && json.errors.length) {
            const isAuthError = e => e && (
                /token is expired|no token|token_expired|unauthenticated/i.test(String(e.message)) ||
                (e.extensions && e.extensions.code === 'UNAUTHENTICATED')
            )
            if (retryAuth && json.errors.every(isAuthError)) {
                await this.refreshSession()
                return this.queryJson(query, false)
            }
            throw new Error(json.errors.map(e => e && e.message || 'Komiic GraphQL error').join('; '))
        }
        if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
            throw new Error('Missing Komiic GraphQL data')
        }
        return json
    }

    parseComic(comic) {
        if (!comic || comic.id == null || !comic.title || !comic.imageUrl) {
            throw new Error('Invalid Komiic comic data')
        }
        const authors = comic.authors == null ? [] : comic.authors
        const categories = comic.categories == null ? [] : comic.categories
        if (!Array.isArray(authors) || !Array.isArray(categories)) {
            throw new Error('Invalid Komiic comic metadata')
        }
        const updateTime = comic.dateUpdated ? new Date(comic.dateUpdated) : null
        const validDate = updateTime && Number.isFinite(updateTime.getTime())
        let description = ''
        if (validDate) {
            const hours = Math.max(0, Math.floor((Date.now() - updateTime.getTime()) / 3600000))
            description = hours < 1 ? '剛剛更新' : hours < 24 ? `${hours}小時前更新` : `${Math.floor(hours / 24)}天前更新`
        }
        return {
            id: String(comic.id),
            title: comic.title,
            subTitle: authors.map(a => a.name).filter(Boolean).join(', '),
            cover: comic.imageUrl,
            tags: categories.map(c => c.name).filter(Boolean),
            description,
            updateTime: validDate ? `${updateTime.getFullYear()}-${updateTime.getMonth() + 1}-${updateTime.getDate()}` : undefined
        }
    }

    async queryComics(query) {
        let operationName = query["operationName"]
        let json = await this.queryJson(query)
        if (!Array.isArray(json.data[operationName])) {
            throw new Error(`Missing Komiic ${operationName} comic list`)
        }
        // The API exposes offsets, not a total. Omit an unknown page count.
        return {
            comics: json.data[operationName].map(c => this.parseComic(c))
        }
    }

    parseSearchComics(json) {
        const result = json.data.searchComicsAndAuthors
        if (!result || !Array.isArray(result.comics)) throw new Error('Missing Komiic search comic list')
        return result.comics.map(c => this.parseComic(c))
    }

    /// 账号
    /// 设置为null禁用账号功能
    account = {
        /// 登录
        /// 返回任意值表示登录成功
        login: async (account, pwd) => {
            let res = await Network.post(
                'https://komiic.com/api/login',
                this.headers,
                {
                    email: account,
                    password: pwd
                },
                { maskDataInLog: true }
            )

            if (res.status === 200) {
                // Login now sets HttpOnly cookies; its body may be empty.
                const json = await this.queryJson({
                    operationName: 'accountQuery', variables: {},
                    query: 'query accountQuery { account { id } }'
                }, false)
                if (!json.data.account || json.data.account.id == null || String(json.data.account.id) === '0' || String(json.data.account.id) === '') {
                    throw new Error('Failed to login: authenticated account missing')
                }
                this.deleteData('token')
                return 'ok'
            }

            throw new Error(`Failed to login (HTTP ${res.status})`)
        },

        // 退出登录时将会调用此函数
        logout: () => {
            // Native Venera does not await logout. Clear local state immediately,
            // and snapshot cookies so the asynchronous revocation cannot race cleanup.
            const cookies = Network.getCookies('https://komiic.com/auth/logout')
            const headers = {
                ...this.headers,
                cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ')
            }
            Network.deleteCookies('https://komiic.com/')
            this.deleteData('token')
            this.deleteData('account')
            const pending = Network.post('https://komiic.com/auth/logout', headers, {}, {
                maskDataInLog: true, maskHeadersInLog: ['cookie']
            }).then(res => {
                if (res.status !== 200) throw new Error(`Failed to logout (HTTP ${res.status})`)
            })
            pending.catch(() => console.error('Komiic server logout failed; the local session was cleared'))
            return pending
        },

        registerWebsite: "https://komiic.com/register"
    }

    /// 探索页面
    /// 一个漫画源可以有多个探索页面
    explore = [
        {
            /// 标题
            /// 标题同时用作标识符, 不能重复
            title: "Komiic",

            /// singlePageWithMultiPart 或者 multiPageComicList
            type: "multiPageComicList",

            load: async (page) => {
                return await this.queryComics({ "operationName": "recentUpdate", "variables": { "pagination": { "limit": 20, "offset": (page - 1) * 20, "orderBy": "DATE_UPDATED", "status": "", "asc": true } }, "query": "query recentUpdate($pagination: Pagination!) {\n  recentUpdate(pagination: $pagination) {\n    id\n    title\n    status\n    year\n    imageUrl\n    authors {\n      id\n      name\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    dateUpdated\n    monthViews\n    views\n    favoriteCount\n    lastBookUpdate\n    lastChapterUpdate\n    __typename\n  }\n}" })
            }
        }
    ]

    category = {
        title: "Komiic",
        enableRankingPage: true,
        parts: [
            {
                name: "主题",

                type: "fixed",

                categories: ['全部', '愛情', '神鬼', '校園', '搞笑', '生活', '懸疑', '冒險', '職場', '魔幻', '後宮', '魔法', '格鬥', '宅男', '勵志', '耽美', '科幻', '百合', '治癒', '萌系', '熱血', '競技', '推理', '雜誌', '偵探', '偽娘', '美食', '恐怖', '四格', '社會', '歷史', '戰爭', '舞蹈', '武俠', '機戰', '音樂', '體育', '黑道'],

                itemType: "category",

                // 若提供, 数量需要和`categories`一致, `categoryComics.load`方法将会收到此参数
                categoryParams: ['0', '1', '3', '4', '5', '6', '7', '8', '10', '11', '2', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '9', '28', '31', '32', '33', '34', '35', '36', '37', '40', '42']
            }
        ]
    }

    /// 分类漫画页面, 即点击分类标签后进入的页面
    categoryComics = {
        load: async (category, param, options, page) => {
          let variables = {
              pagination: {
                  limit: 30,
                  offset: (page - 1) * 30,
                  orderBy: options[0],
                  asc: false,
                  status: options[1]
              }
          };
          
          if (param !== '0') {
              variables.categoryId = [param];
          } else {
              variables.categoryId = [];
          }

          return await this.queryComics({ 
              "operationName": "comicByCategories",
              "variables": variables,
              "query": `query comicByCategories($categoryId: [ID!]!, $pagination: Pagination!) {
                  comicByCategories(categoryId: $categoryId, pagination: $pagination) {
                      id
                      title
                      status
                      year
                      imageUrl
                      authors { id name __typename }
                      categories { id name __typename }
                      dateUpdated
                      monthViews
                      views
                      favoriteCount
                      lastBookUpdate
                      lastChapterUpdate
                      __typename
                  }
              }`
          })
        },
        // 提供选项
        optionList: [
            {
                options: [
                    "DATE_UPDATED-更新",
                    "VIEWS-觀看數",
                    "FAVORITE_COUNT-喜愛數",
                ],
                notShowWhen: null,
                showWhen: null
            },
            {
                options: [
                    "-全部",
                    "ONGOING-連載中",
                    "END-完結",
                ],
                notShowWhen: null,
                showWhen: null
            },
        ],
        ranking: {
            options: [
                "MONTH_VIEWS-月",
                "VIEWS-綜合"
            ],
            load: async (option, page) => {
                return this.queryComics({ "operationName": "hotComics", "variables": { "pagination": { "limit": 20, "offset": (page - 1) * 20, "orderBy": option, "status": "", "asc": true } }, "query": "query hotComics($pagination: Pagination!) {\n  hotComics(pagination: $pagination) {\n    id\n    title\n    status\n    year\n    imageUrl\n    authors {\n      id\n      name\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    dateUpdated\n    monthViews\n    views\n    favoriteCount\n    lastBookUpdate\n    lastChapterUpdate\n    __typename\n  }\n}" })
            }
        }
    }

    /// 搜索
    search = {
        load: async (keyword, options, page) => {
            let json = await this.queryJson({ "operationName": "searchComicAndAuthorQuery", "variables": { "keyword": keyword }, "query": "query searchComicAndAuthorQuery($keyword: String!) {\n  searchComicsAndAuthors(keyword: $keyword) {\n    comics {\n      id\n      title\n      status\n      year\n      imageUrl\n      authors {\n        id\n        name\n        __typename\n      }\n      categories {\n        id\n        name\n        __typename\n      }\n      dateUpdated\n      monthViews\n      views\n      favoriteCount\n      lastBookUpdate\n      lastChapterUpdate\n      __typename\n    }\n    authors {\n      id\n      name\n      chName\n      enName\n      wikiLink\n      comicCount\n      views\n      __typename\n    }\n    __typename\n  }\n}" })

            return {
                comics: this.parseSearchComics(json),
                // 搜索接口一次返回全部匹配结果。
                maxPage: 1
            }
        },

        optionList: []
    }

    /// 收藏
    favorites = {
        /// 是否为多收藏夹
        multiFolder: true,
        /// 添加或者删除收藏
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            let query = {}
            if (isAdding) {
                query = { "operationName": "addComicToFolder", "variables": { "comicId": comicId, "folderId": folderId }, "query": "mutation addComicToFolder($comicId: ID!, $folderId: ID!) {\n  addComicToFolder(comicId: $comicId, folderId: $folderId)\n}" }
            } else {
                query = { "operationName": "removeComicToFolder", "variables": { "comicId": comicId, "folderId": folderId }, "query": "mutation removeComicToFolder($comicId: ID!, $folderId: ID!) {\n  removeComicToFolder(comicId: $comicId, folderId: $folderId)\n}" }
            }
            await this.queryJson(query)
            return "ok"
        },
        // 加载收藏夹, 仅当multiFolder为true时有效
        // 当comicId不为null时, 需要同时返回包含该漫画的收藏夹
        loadFolders: async (comicId) => {
            let json = await this.queryJson({ "operationName": "myFolder", "variables": {}, "query": "query myFolder {\n  folders {\n    id\n    key\n    name\n    views\n    comicCount\n    dateCreated\n    dateUpdated\n    __typename\n  }\n}" })
            let folders = {}
            json.data.folders.forEach((f) => {
                folders[f.id] = f.name
            })
            let favorited = null
            if (comicId) {
                let json2 = await this.queryJson({ "operationName": "comicInAccountFolders", "variables": { "comicId": comicId }, "query": "query comicInAccountFolders($comicId: ID!) {\n  comicInAccountFolders(comicId: $comicId)\n}" })
                favorited = json2.data.comicInAccountFolders
            }
            return {
                folders: folders,
                favorited: favorited
            }
        },
        /// 创建收藏夹
        addFolder: async (name) => {
            let json = await this.queryJson({ "operationName": "createFolder", "variables": { "name": name }, "query": "mutation createFolder($name: String!) {\n  createFolder(name: $name) {\n    id\n    key\n    name\n    account {\n      id\n      nickname\n      __typename\n    }\n    comicCount\n    views\n    dateCreated\n    dateUpdated\n    __typename\n  }\n}" })
            return "ok"
        },
        deleteFolder: async (id) => {
            let json = await this.queryJson({ "operationName": "removeFolder", "variables": { "folderId": id }, "query": "mutation removeFolder($folderId: ID!) {\n  removeFolder(folderId: $folderId)\n}" })
            return "ok"
        },
        /// 加载漫画
        loadComics: async (page, folder) => {
            let json = await this.queryJson({ "operationName": "folderComicIds", "variables": { "folderId": folder, "pagination": { "limit": 30, "offset": (page - 1) * 30, "orderBy": "DATE_UPDATED", "status": "", "asc": true } }, "query": "query folderComicIds($folderId: ID!, $pagination: Pagination!) {\n  folderComicIds(folderId: $folderId, pagination: $pagination) {\n    folderId\n    key\n    comicIds\n    __typename\n  }\n}" })
            let ids = json.data.folderComicIds.comicIds
            if (ids.length == 0) {
                return {
                    comics: [],
                    maxPage: 1
                }
            }
            return this.queryComics({ "operationName": "comicByIds", "variables": { "comicIds": ids }, "query": "query comicByIds($comicIds: [ID]!) {\n  comicByIds(comicIds: $comicIds) {\n    id\n    title\n    status\n    year\n    imageUrl\n    authors {\n      id\n      name\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    dateUpdated\n    monthViews\n    views\n    favoriteCount\n    lastBookUpdate\n    lastChapterUpdate\n    __typename\n  }\n}" })
        }
    }

    /// 单个漫画相关
    comic = {
        // 加载漫画信息
        loadInfo: async (id) => {
            let json1 = await this.queryJson({ "operationName": "recommendComicById", "variables": { "comicId": id }, "query": "query recommendComicById($comicId: ID!) {\n  recommendComicById(comicId: $comicId)\n}" })
            if (!Array.isArray(json1.data.recommendComicById)) throw new Error('Missing Komiic recommendations')
            let recommend = Array.from(new Set(json1.data.recommendComicById.map(String)))
            if (!recommend.includes(String(id))) recommend.push(String(id))

            let getFavoriteStatus = async () => {
                if (!this.isLogged && !this.loadData('account')) {
                    return false
                }
                let json = await this.queryJson({ "operationName": "comicInAccountFolders", "variables": { "comicId": id }, "query": "query comicInAccountFolders($comicId: ID!) {\n  comicInAccountFolders(comicId: $comicId)\n}" })
                let folders = json.data.comicInAccountFolders
                if (!Array.isArray(folders)) throw new Error('Missing Komiic favorite status')
                return folders.length !== 0
            }

            let getChapter = async () => {
                let json = await this.queryJson({ "operationName": "chapterByComicId", "variables": { "comicId": id }, "query": "query chapterByComicId($comicId: ID!) {\n  chaptersByComicId(comicId: $comicId) {\n    id\n    serial\n    type\n    dateCreated\n    dateUpdated\n    size\n    __typename\n  }\n}" })
                let all = json.data.chaptersByComicId
                if (!Array.isArray(all)) throw new Error('Missing Komiic chapters')
                const ids = new Set()
                let books = [], chapters = []
                all.forEach((c) => {
                    if (!c || c.id == null || String(c.id) === '' || ids.has(String(c.id))) {
                        throw new Error('Invalid or duplicate Komiic chapter id')
                    }
                    ids.add(String(c.id))
                    if(c.type === 'book') {
                        books.push(c)
                    } else {
                        chapters.push(c)
                    }
                })
                let res = new Map()
                books.forEach((c) => {
                    let name = '卷' + c.serial
                    res.set(String(c.id), name)
                })
                chapters.forEach((c) => {
                    let name = String(c.serial == null ? c.id : c.serial)
                    res.set(String(c.id), name)
                })
                return res
            }

            let results = await Promise.all([
                this.queryComics({ "operationName": "comicByIds", "variables": { "comicIds": recommend }, "query": "query comicByIds($comicIds: [ID]!) {\n  comicByIds(comicIds: $comicIds) {\n    id\n    title\n    status\n    year\n    imageUrl\n    authors {\n      id\n      name\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    dateUpdated\n    monthViews\n    views\n    favoriteCount\n    lastBookUpdate\n    lastChapterUpdate\n    __typename\n  }\n}" }),
                getChapter.call(),
                getFavoriteStatus()
            ])

            let info = results[0].comics.find(c => c.id === String(id))
            if (!info) throw new Error('Requested Komiic comic was not returned')
            const recommendations = new Map()
            results[0].comics.forEach(c => {
                if (c.id !== String(id)) recommendations.set(c.id, c)
            })

            return {
                // string 标题
                title: info.title,
                // string 封面url
                cover: info.cover,
                // map<string, string[]> 标签
                tags: {
                    "作者": [info.subTitle],
                    "标签": info.tags
                },
                // map<string, string>?, key为章节id, value为章节名称
                chapters: results[1],
                recommend: Array.from(recommendations.values()),
                isFavorite: results[2],
                updateTime: info.updateTime,
            }
        },
        // 获取章节图片
        loadEp: async (comicId, epId) => {
            let json = await this.queryJson({ "operationName": "imagesByChapterId", "variables": { "chapterId": epId }, "query": "query imagesByChapterId($chapterId: ID!) {\n  imagesByChapterId(chapterId: $chapterId) {\n    id\n    kid\n    height\n    width\n    __typename\n  }\n}" })
            const images = json.data.imagesByChapterId
            if (!Array.isArray(images) || images.length === 0) throw new Error('Missing Komiic chapter images')
            return {
                images: images.map((i) => {
                    if (!i || typeof i.kid !== 'string' || !i.kid) throw new Error('Invalid Komiic image kid')
                    return `https://komiic.com/api/image/${encodeURIComponent(i.kid)}`
                })
            }
        },
        // 可选, 调整图片加载的行为
        onImageLoad: async (url, comicId, epId) => {
            const prefix = 'https://komiic.com/api/image/'
            if (typeof url !== 'string' || !url.startsWith(prefix)) throw new Error('Invalid Komiic image URL')
            const kid = decodeURIComponent(url.substring(prefix.length))
            if (!kid || /[/?#]/.test(kid)) throw new Error('Invalid Komiic image kid')
            const loadTicket = async (retry) => {
                // Anonymous refreshImageTicket currently returns TICKET_NOT_FOUND.
                // Re-read a ticket once, without mutating the account or hiding failure.
                const operation = 'getImageTicket'
                const json = await this.queryJson({
                    operationName: operation,
                    variables: { kid },
                    query: `query ${operation}($kid: String!) { ${operation}(kid: $kid) { url ticket kid width height expiresAt } }`
                })
                const ticket = json.data[operation]
                if (!ticket || ticket.kid !== kid || typeof ticket.url !== 'string' || !/^https?:\/\//.test(ticket.url) ||
                    typeof ticket.ticket !== 'string' || !ticket.ticket || !Number.isFinite(Date.parse(ticket.expiresAt)) ||
                    Date.parse(ticket.expiresAt) - Date.now() < 10000) {
                    throw new Error('Invalid or expired Komiic image ticket')
                }
                const config = {
                    url: ticket.url,
                    headers: {
                        'User-Agent': this.headers['User-Agent'],
                        'Referer': `https://komiic.com/comic/${comicId}/chapter/${epId}/images/all`,
                        'X-Image-Ticket': ticket.ticket
                    }
                }
                if (!retry) config.onLoadFailed = () => loadTicket(true)
                return config
            }
            return loadTicket(false)
        },
        // 加载评论
        loadComments: async (comicId, subId, page, replyTo) => {
            let operationName = replyTo ? "messageChan" : "getMessagesByComicId"
            let promise = replyTo
                ? this.queryJson({ "operationName": "messageChan", "variables": { "messageId": replyTo }, "query": "query messageChan($messageId: ID!) {\n  messageChan(messageId: $messageId) {\n    id\n    comicId\n    account {\n      id\n      nickname\n      profileText\n      profileTextColor\n      profileBackgroundColor\n      profileImageUrl\n      __typename\n    }\n    message\n    replyTo {\n      id\n      __typename\n    }\n    upCount\n    downCount\n    dateUpdated\n    dateCreated\n    __typename\n  }\n}" })
                : this.queryJson({ "operationName": "getMessagesByComicId", "variables": { "comicId": comicId, "pagination": { "limit": 100, "offset": (page - 1) * 100, "orderBy": "DATE_UPDATED", "asc": true } }, "query": "query getMessagesByComicId($comicId: ID!, $pagination: Pagination!) {\n  getMessagesByComicId(comicId: $comicId, pagination: $pagination) {\n    id\n    comicId\n    account {\n      id\n      nickname\n      profileText\n      profileTextColor\n      profileBackgroundColor\n      profileImageUrl\n      __typename\n    }\n    message\n    replyTo {\n      id\n      message\n      account {\n        id\n        nickname\n        profileText\n        profileTextColor\n        profileBackgroundColor\n        profileImageUrl\n        __typename\n      }\n      __typename\n    }\n    upCount\n    downCount\n    dateUpdated\n    dateCreated\n    __typename\n  }\n}" })
            let json = await promise
            return {
                comments: json.data[operationName].map(e => {
                    return {
                        // string
                        userName: e.account.nickname,
                        // string
                        avatar: e.account.profileImageUrl,
                        // string
                        content: e.message,
                        // string?
                        time: e.dateUpdated,
                        // number?
                        // TODO: 没有数量信息, 但是设为null会禁用回复功能
                        replyCount: 0,
                        // string
                        id: e.id,
                    }
                }),
                ...(replyTo ? { maxPage: 1 } : {}),
            }
        },
        // 发送评论, 返回任意值表示成功
        sendComment: async (comicId, subId, content, replyTo) => {
            if (!replyTo) {
                replyTo = "0"
            }
            let json = await this.queryJson({ "operationName": "addMessageToComic", "variables": { "comicId": comicId, "message": content, "replyToId": replyTo }, "query": "mutation addMessageToComic($comicId: ID!, $replyToId: ID!, $message: String!) {\n  addMessageToComic(message: $message, comicId: $comicId, replyToId: $replyToId) {\n    id\n    message\n    comicId\n    account {\n      id\n      nickname\n      __typename\n    }\n    replyTo {\n      id\n      message\n      account {\n        id\n        nickname\n        profileText\n        profileTextColor\n        profileBackgroundColor\n        profileImageUrl\n        __typename\n      }\n      __typename\n    }\n    dateCreated\n    dateUpdated\n    __typename\n  }\n}" })
            return "ok"
        }
    }
}
