class Baozi extends ComicSource {
  // 此漫画源的名称
  name = "包子漫画";

  // 唯一标识符
  key = "baozi";

  version = "1.1.8";

  minAppVersion = "1.0.0";

  // 更新链接
  url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/baozi.js";

  // 原生宿主在源注册前读取登录元数据，固定账号入口不能提前读取设置。
  accountUrl = "https://www.baozimh.com";

  settings = {
    language: {
      title: "简繁切换",
      type: "select",
      options: [
        { value: "cn", text: "简体" },
        { value: "tw", text: "繁體" },
      ],
      default: "cn",
    },
    domains: {
      title: "主域名",
      type: "select",
      options: [
        { value: "bzmgcn.com" },
        { value: "baozimhcn.com" },
        { value: "webmota.com" },
        { value: "kukuc.co" },
        { value: "twmanga.com" },
        { value: "dinnerku.com" },
      ],
      default: "twmanga.com",
    },
    cdn_domains: {
      title: "图片资源站域名",
      type: "select",
      options: [
        { value: "s1.baozimh.com" },
        { value: "as-rsa1-usla.baozicdn.com" },
        { value: "ascn-a3.bzcdn.net" },
        { value: "asgb-a3.bzcdn.net" },
        { value: "as.baozimh.com" },
        { value: "s1.baozicdn.com" },
        { value: "", text: "默认" },
      ],
      default: "",
    },
    image_quality: {
      title: "图片质量",
      type: "select",
      options: [
        {
          value: "/w640",
          text: "640p"
        },
        {
          value: "",
          text: "原图"
        }
      ],
      default: "/w640",
    },
  };

  // 动态生成完整域名
  get lang() {
    return this.loadSetting("language") || this.settings.language.default;
  }
  get baseUrl() {
    let domain = this.loadSetting("domains") || this.settings.domains.default;
    // 旧默认入口已跳转到要求额外验证的站点；保留已有设置的可读性。
    if (domain === "bzmgcn.com") domain = "twmanga.com";
    return `https://${this.lang}.${domain}`;
  }

  checkResponse(res) {
    if (/challenge_required|__gatekeeper_challenge|cf-chl-|Just a moment\.\.\./i.test(res.body || "")) {
      throw `反爬验证未完成 (anti_bot, HTTP ${res.status})，请在当前域名网页登录后重试`;
    }
    if (res.status !== 200) throw "Invalid status code: " + res.status;
  }

  async accountRequest(method, path, headers = {}, body = null) {
    let res;
    try {
      res = await Network.sendRequest(method, this.accountUrl + path, {
        ...headers,
        // 原生宿主默认缓存 GET 五秒，登录验证必须读取当前服务端状态。
        "cache-time": "no",
      }, body, {
        maskHeadersInLog: ["Cookie", "cookie"],
        maskDataInLog: true,
        maskResponseInLog: true,
      });
    } catch (error) {
      const message = String(error?.message || error);
      if (/CloudflareException/i.test(message)) throw "CloudflareException: " + this.accountUrl;
      if (/ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) throw "Network request failed: DNS ENOTFOUND";
      if (/CERT_|TLS|SSL/i.test(message)) throw "Network request failed: TLS error";
      if (/timeout|timed out|AbortError/i.test(message)) throw "Network request timeout";
      throw "Network request failed: 账号请求连接失败，请检查网络后重试";
    }
    this.checkResponse(res);
    return res;
  }

  /// 账号
  /// 设置为null禁用账号功能
  account = {
    /// 登录
    /// 返回任意值表示登录成功
    login: async (account, pwd) => {
      let res = await this.accountRequest(
        "POST", "/api/bui/signin",
        {
          "content-type":
            "multipart/form-data; boundary=----WebKitFormBoundaryFUNUxpOwyUaDop8s",
        },
        '------WebKitFormBoundaryFUNUxpOwyUaDop8s\r\nContent-Disposition: form-data; name="username"\r\n\r\n' +
        account +
        '\r\n------WebKitFormBoundaryFUNUxpOwyUaDop8s\r\nContent-Disposition: form-data; name="password"\r\n\r\n' +
        pwd +
        "\r\n------WebKitFormBoundaryFUNUxpOwyUaDop8s--\r\n"
      );
      let json;
      try { json = JSON.parse(res.body); } catch (_) { throw "登录响应格式无效，请使用网页登录"; }
      let token = json?.data;
      if (!json?.result || typeof token !== "string" || !token.trim() || /[\r\n;]/.test(token)) {
        throw "登录失败：未返回有效会话";
      }
      const previous = Network.getCookies(this.accountUrl + "/user/my_bookshelf") || [];
      try {
        Network.setCookies(this.accountUrl, [
          new Cookie({ name: "TSID", value: token, domain: ".baozimh.com" }),
        ]);
        // HTTP 200 和非空 token 都不能证明会话有效；先读取受保护书架。
        await this.favorites.loadComics(1);
      } catch (error) {
        Network.deleteCookies(this.accountUrl);
        Network.setCookies(this.accountUrl, previous);
        throw error;
      }
      return "ok";
    },

    // 退出登录时将会调用此函数
    logout: () => {
      Network.deleteCookies(this.accountUrl);
      this.deleteData("account");
    },

    registerWebsite: `${this.accountUrl}/user/signup`,

    loginWithWebview: {
      url: `${this.accountUrl}/user/my_bookshelf`,
      checkStatus: (url, title) => {
        if (typeof url !== "string" || typeof title !== "string" ||
            !/^我的[书書]架\s*-\s*包子漫[画畫]$/.test(title.trim())) return false;
        return url === `${this.accountUrl}/user/my_bookshelf` ||
          url === `${this.accountUrl}/user/my_bookshelf/`;
      },
    },
  };

  /// 解析漫画列表
  parseComic(e) {
    let url = e.querySelector("a").attributes["href"];
    let id = url.split("/").pop();
    let title = e.querySelector("h3").text.trim();
    let cover = e.querySelector("a > amp-img").attributes["src"];
    let tags = e.querySelectorAll("div.tabs > span").map((e) => e.text.trim());
    let description = e.querySelector("small").text.trim();
    return {
      id: id,
      title: title,
      cover: cover,
      tags: tags,
      description: description,
    };
  }

  parseJsonComic(e) {
    return {
      id: e.comic_id,
      title: e.name,
      subTitle: e.author,
      cover: `https://static-tw.baozimh.com/cover/${e.topic_img}?w=285&h=375&q=100`,
      tags: e.type_names,
    };
  }

  /// 探索页面
  /// 一个漫画源可以有多个探索页面
  explore = [
    {
      /// 标题
      /// 标题同时用作标识符, 不能重复
      title: "包子漫画",

      /// singlePageWithMultiPart 或者 multiPageComicList
      type: "singlePageWithMultiPart",

      load: async () => {
        var res = await Network.get(this.baseUrl);
        this.checkResponse(res);
        let document = new HtmlDocument(res.body);
        let parts = document.querySelectorAll("div.index-recommend-items");
        let result = {};
        for (let part of parts) {
          let title = part.querySelector("div.catalog-title").text.trim();
          let comics = part
            .querySelectorAll("div.comics-card")
            .map((e) => this.parseComic(e));
          if (comics.length > 0) {
            result[title] = comics;
          }
        }
        if (Object.keys(result).length === 0) throw "未找到探索列表，页面结构可能已变化";
        return result;
      },
    },
  ];

  /// 分类页面
  /// 一个漫画源只能有一个分类页面, 也可以没有, 设置为null禁用分类页面
  category = {
    /// 标题, 同时为标识符, 不能与其他漫画源的分类页面重复
    title: "包子漫画",
    parts: [
      {
        name: "类型",

        // fixed 或者 random
        // random用于分类数量相当多时, 随机显示其中一部分
        type: "fixed",

        // 如果类型为random, 需要提供此字段, 表示同时显示的数量
        // randomNumber: 5,

        categories: [
          "全部",
          "恋爱",
          "纯爱",
          "古风",
          "异能",
          "悬疑",
          "剧情",
          "科幻",
          "奇幻",
          "玄幻",
          "穿越",
          "冒险",
          "推理",
          "武侠",
          "格斗",
          "战争",
          "热血",
          "搞笑",
          "大女主",
          "都市",
          "总裁",
          "后宫",
          "日常",
          "韩漫",
          "少年",
          "其它",
        ],

        // category或者search
        // 如果为category, 点击后将进入分类漫画页面, 使用下方的`categoryComics`加载漫画
        // 如果为search, 将进入搜索页面
        itemType: "category",

        // 若提供, 数量需要和`categories`一致, `categoryComics.load`方法将会收到此参数
        categoryParams: [
          "all",
          "lianai",
          "chunai",
          "gufeng",
          "yineng",
          "xuanyi",
          "juqing",
          "kehuan",
          "qihuan",
          "xuanhuan",
          "chuanyue",
          "mouxian",
          "tuili",
          "wuxia",
          "gedou",
          "zhanzheng",
          "rexie",
          "gaoxiao",
          "danuzhu",
          "dushi",
          "zongcai",
          "hougong",
          "richang",
          "hanman",
          "shaonian",
          "qita",
        ],
      },
    ],
    enableRankingPage: false,
  };

  /// 分类漫画页面, 即点击分类标签后进入的页面
  categoryComics = {
    load: async (category, param, options, page) => {
      let res = await Network.get(
        `${this.baseUrl}/api/bzmhq/amp_comic_list?type=${param}&region=${options[0]}&state=${options[1]}&filter=%2a&page=${page}&limit=36&language=${this.lang}&__amp_source_origin=${this.baseUrl}`
      );
      this.checkResponse(res);
      let json = JSON.parse(res.body);
      if (!Array.isArray(json.items)) throw "分类响应缺少漫画列表";
      return {
        comics: json.items.map((e) => this.parseJsonComic(e)),
        ...(!json.next ? { maxPage: page } : {}),
      };
    },
    // 提供选项
    optionList: [
      {
        options: ["all-全部", "cn-国漫", "jp-日本", "kr-韩国", "en-欧美"],
      },
      {
        options: ["all-全部", "serial-连载中", "pub-已完结"],
      },
    ],
  };

  /// 搜索
  search = {
    load: async (keyword, options, page) => {
      let res = await Network.get(`${this.baseUrl}/search?q=${encodeURIComponent(keyword)}`);
      this.checkResponse(res);
      let document = new HtmlDocument(res.body);
      if (!document.querySelector('form[action="/search"]')) throw "未找到搜索页面，页面结构可能已变化";
      let comics = document
        .querySelectorAll("div.comics-card")
        .map((e) => this.parseComic(e));
      return {
        comics: comics,
        maxPage: 1,
      };
    },

    // 提供选项
    optionList: [],
  };

  /// 收藏
  favorites = {
    /// 是否为多收藏夹
    multiFolder: false,
    /// 添加或者删除收藏
    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      if (typeof comicId !== "string" || !comicId || typeof isAdding !== "boolean") throw "无效收藏操作";
      const contains = shelf => shelf.comics.some(comic => comic.id === comicId);
      if (contains(await this.favorites.loadComics(1)) === isAdding) return "ok";
      const op = isAdding ? "set_bookmark" : "del_bookmark";
      await this.accountRequest("POST", `/user/operation_v2?op=${op}&comic_id=${encodeURIComponent(comicId)}${isAdding ? "&chapter_slot=0" : ""}`);
      if (contains(await this.favorites.loadComics(1)) !== isAdding) throw "收藏状态未确认，请刷新书架后重试";
      return "ok";
    },
    // 加载收藏夹, 仅当multiFolder为true时有效
    // 当comicId不为null时, 需要同时返回包含该漫画的收藏夹
    loadFolders: null,
    /// 加载漫画
    loadComics: async (page, folder) => {
      let res = await this.accountRequest("GET", "/user/my_bookshelf");
      let document = new HtmlDocument(res.body);
      const title = document.querySelector("title")?.text.trim() || "";
      if (!/^我的[书書]架\s*-\s*包子漫[画畫]$/.test(title) ||
          !document.querySelector('a[href*="op=logout"]')) {
        throw "书架返回了未登录或异常页面（即使 HTTP 200），请在 www.baozimh.com 重新网页登录";
      }
      function parseComic(e) {
        let title = e.querySelector("h4 > a").text.trim();
        let url = e.querySelector("h4 > a").attributes["href"];
        let id = url.split("/").pop();
        let author = e
          .querySelector("div.info > ul")
          .children[1].text.split("：")[1]
          .trim();
        let description = e
          .querySelector("div.info > ul")
          .children[4].children[0].text.trim();

        return {
          id: id,
          title: title,
          subTitle: author,
          description: description,
          cover: e.querySelector("amp-img").attributes["src"],
        };
      }
      let comics = document
        .querySelectorAll("div.bookshelf-items")
        .map((e) => parseComic(e));
      return {
        comics: comics,
        maxPage: 1,
      };
    },
  };

  /// 单个漫画相关
  comic = {
    // 加载漫画信息
    loadInfo: async (id) => {
      let res = await Network.get(`${this.baseUrl}/comic/${id}`);
      this.checkResponse(res);
      let document = new HtmlDocument(res.body);

      let title = document.querySelector("h1.comics-detail__title").text.trim();
      let cover = document.querySelector("div.l-content > div > div > amp-img")
        .attributes["src"];
      let author = document
        .querySelector("h2.comics-detail__author")
        .text.trim();
      let tags = document
        .querySelectorAll("div.tag-list > span")
        .map((e) => e.text.trim());
      tags = [...tags.filter((e) => e !== "")];
      let updateTime = document
        .querySelector("div.supporting-text > div > span > em")
        ?.text.trim()
        .replace("(", "")
        .replace(")", "");
      if (!updateTime) {
        const getLastChapterText = () => {
          // 合并所有章节容器（处理可能存在多个列表的情况）
          const containers = [
            ...document.querySelectorAll(
              "#chapter-items, #chapters_other_list"
            ),
          ];
          let allChapters = [];
          containers.forEach((container) => {
            const chapters = container.querySelectorAll(".comics-chapters > a");
            allChapters.push(...Array.from(chapters));
          });
          const lastChapter = allChapters[allChapters.length - 1];
          return (
            lastChapter?.querySelector("div > span")?.text.trim() ||
            "暂无更新信息"
          );
        };
        updateTime = getLastChapterText();
      }
      let description = document
        .querySelector("p.comics-detail__desc")
        .text.trim();
      let chapters = new Map();
      let chapterLinks = document.querySelectorAll("#chapter-items .comics-chapters > a, #chapters_other_list .comics-chapters > a");
      if (!chapterLinks.length) chapterLinks = document.querySelectorAll("div.comics-chapters > a").reverse();
      for (let c of chapterLinks) {
        const href = c.attributes.href || "";
        const section = href.match(/[?&]section_slot=(\d+)(?:&|$)/)?.[1];
        const slot = href.match(/[?&]chapter_slot=(\d+)(?:&|$)/)?.[1];
        const pathSlots = href.match(/\/(\d+)_(\d+)\.html(?:[?#]|$)/);
        const sectionId = section ?? pathSlots?.[1];
        const chapterId = slot ?? pathSlots?.[2];
        if (sectionId === undefined || chapterId === undefined) throw "章节链接缺少真实编号";
        const epId = sectionId === "0" ? chapterId : `${sectionId}_${chapterId}`;
        if (chapters.has(epId)) throw "章节编号重复";
        chapters.set(epId, c.text.trim());
      }
      if (!chapters.size) throw "未找到章节，页面结构可能已变化";
      let recommend = [];
      for (let c of document.querySelectorAll("div.recommend--item")) {
        if (c.querySelectorAll("div.tag-comic").length > 0) {
          let title = c.querySelector("span").text.trim();
          let cover = c.querySelector("amp-img").attributes["src"];
          let url = c.querySelector("a").attributes["href"];
          let id = url.split("/").pop();
          recommend.push({
            id: id,
            title: title,
            cover: cover,
          });
        }
      }
      // updateTime 将 Y年 M月 D日 转化为 Y-M-D
      let updateDate = updateTime
        .replace(/年/g, "-")
        .replace(/月/g, "-")
        .replace(/日/g, "");

      return new ComicDetails({
        title: title,
        cover: cover,
        description: description,
        tags: {
          作者: [author],
          标签: tags,
        },
        chapters: chapters,
        recommend: recommend,
        updateTime: updateDate,
      });
    },
    loadEp: async (comicId, epId) => {
      const images = [];

      if (!/^\d+(?:_\d+)?$/.test(String(epId))) throw "无效章节编号";
      const slots = String(epId).includes("_") ? String(epId) : `0_${epId}`;
      let currentPageUrl = `${this.baseUrl}/comic/chapter/${encodeURIComponent(comicId)}/${slots}.html`;

      const res = await Network.get(currentPageUrl);
      this.checkResponse(res);

      const doc = new HtmlDocument(res.body);

      const imageNodes = doc.querySelectorAll(".comic-contain amp-img.comic-contain__item");
      imageNodes.forEach((imgNode) => {
        let imgUrl = imgNode.attributes.src || imgNode.attributes["data-src"];
        if (imgUrl) {
          const match = imgUrl.match(/^(https?:\/\/)?([^/\s:]+)(:\d+)?(\/[a-z]comic\/.*)/);
          if (match) {
            // 网页运行时会把失效的 bzcdn 图片入口切换到 baozimh CDN。
            const domain = this.loadSetting("cdn_domains") || match[2].replace(/^s(\d+)\.bzcdn\.net$/, "s$1.baozimh.com");
            const quality = this.loadSetting("image_quality") ?? this.settings.image_quality.default;
            imgUrl = `${match[1] || "https://"}${domain}${match[3] || ""}${quality}${match[4]}`;
          }
          images.push(imgUrl);
        }
      });
      if (!images.length) throw "未找到正文图片，页面结构可能已变化或需要网页验证";
      return { images: images };
    },
  };
}
