class ComicWalker extends ComicSource {
  name = "カドコミ";
  key = "comic_walker";
  version = "1.0.2";
  minAppVersion = "1.6.0";
  url =
    "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/comic_walker.js";

  api_key = "ytBrdQ2ZYdRQguqEusVLxQVUgakNnVht";

  latestVersion = "1.6.9";

  api_base = "https://mobileapp.comic-walker.com";

  web_base = "https://comic-walker.com";

  settings = {
    contentApi: {
      title: "内容来源（官网不含 App 限定内容和每日租借）",
      type: "select",
      default: "web",
      options: [
        { value: "web", text: "官网（推荐）" },
        { value: "app", text: "旧 App 接口（目前可能返回 HTTP 403）" },
      ],
    },
  };

  get useApp() {
    return this.loadSetting("contentApi") === "app";
  }

  get webHeaders() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": `${this.web_base}/`,
    };
  }

  isWebComic(id) {
    return typeof id === "string" && /^[A-Za-z0-9]+_\d+_S$/.test(id);
  }

  async webRequest(path) {
    const response = await Network.get(`${this.web_base}/api${path}`, this.webHeaders);
    if (response.status !== 200) {
      throw new Error(`カドコミ官网 HTTP ${response.status}`);
    }
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (_) {
      throw new Error("カドコミ官网返回非 JSON 数据，请检查网络或访问验证");
    }
    if (!result || typeof result !== "object" || Array.isArray(result) || result.error) {
      throw new Error("Invalid ComicWalker web API response");
    }
    return result;
  }

  webComic(item) {
    const cover = item?.bookCover || item?.originalThumbnail || item?.thumbnail;
    if (!item || !this.isWebComic(item.code) || typeof item.title !== "string" ||
        !item.title.trim() || typeof cover !== "string" || !cover) {
      throw new Error("Invalid ComicWalker web comic");
    }
    return new Comic({
      id: item.code,
      title: item.title,
      cover,
      tags: [
        ...(item.authors || []).map(author => author.name),
        ...(item.internal?.labelNames || []),
      ],
    });
  }

  async webList(path, page = 1) {
    const limit = 20;
    const separator = path.endsWith("?") ? "" : "&";
    const res = await this.webRequest(`${path}${separator}limit=${limit}&offset=${(page - 1) * limit}`);
    const total = res.pagination?.total ?? res.total;
    if (!Array.isArray(res.result) || !Number.isFinite(total) || total < 0) {
      throw new Error("Invalid ComicWalker web list pagination");
    }
    return {
      comics: res.result.map(item => this.webComic(item)),
      maxPage: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async webInfo(id) {
    const res = await this.webRequest(`/contents/details/work?workCode=${encodeURIComponent(id)}`);
    const work = res.work;
    if (!work || work.code !== id || typeof work.title !== "string" || !work.title) {
      throw new Error("Invalid ComicWalker web work details");
    }
    const collections = [];
    for (const field of ["firstEpisodes", "latestEpisodes"]) {
      if (res[field] !== undefined) {
        if (!Array.isArray(res[field]?.result)) throw new Error("Invalid ComicWalker web episode list");
        collections.push(res[field].result);
      }
    }
    if (res.comics !== undefined) {
      if (!Array.isArray(res.comics?.result)) throw new Error("Invalid ComicWalker web volume list");
      for (const volume of res.comics.result) {
        if (!Array.isArray(volume.episodes)) throw new Error("Invalid ComicWalker web volume episodes");
        collections.push(volume.episodes);
      }
    }
    for (const volume of [res.firstComic, res.latestComic]) {
      if (volume) {
        if (!Array.isArray(volume.episodes)) throw new Error("Invalid ComicWalker web volume episodes");
        collections.push(volume.episodes);
      }
    }
    if (collections.length === 0) throw new Error("Missing ComicWalker web episode collections");
    const episodes = new Map();
    for (const entries of collections) {
      for (const episode of entries) {
        if (!episode || typeof episode.id !== "string" || !episode.id ||
            typeof episode.title !== "string" || !episode.title) {
          throw new Error("Invalid ComicWalker web episode");
        }
        episodes.set(episode.id, episode);
      }
    }
    const ordered = [...episodes.values()].sort((a, b) => {
      const left = a.internal?.episodeNo;
      const right = b.internal?.episodeNo;
      if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
      if (Number.isFinite(left)) return -1;
      if (Number.isFinite(right)) return 1;
      return 0;
    });
    const chapters = new Map();
    for (const episode of ordered) {
      const title = [episode.title, episode.subTitle].filter(Boolean).join(" - ");
      chapters.set(episode.id, episode.isActive === false ? `❌ ${title}` : title);
    }
    const tags = new Map();
    const addTag = (namespace, value) => {
      if (!value) return;
      if (!tags.has(namespace)) tags.set(namespace, []);
      if (!tags.get(namespace).includes(value)) tags.get(namespace).push(value);
    };
    for (const author of work.authors || []) addTag(author.role || "著者", author.name);
    for (const label of res.labels || []) addTag("Labels", label.name);
    if (res.label) addTag("Labels", res.label.name);
    for (const genre of [work.genre, work.subGenre]) if (genre) addTag("ジャンル", genre.name);
    for (const tag of work.tags || []) addTag("タグ", tag.name);
    return new ComicDetails({
      title: work.title,
      subtitle: (work.authors || []).map(author => author.name).join("・"),
      cover: this.webComic(work).cover,
      description: (work.summary || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
      tags,
      chapters,
      updateTime: work.nextUpdateDateText,
      url: `${this.web_base}/detail/${id}`,
      maxPage: chapters.size,
    });
  }

  async webEpisode(epId) {
    const res = await this.webRequest(`/contents/viewer?episodeId=${encodeURIComponent(epId)}&imageSizeType=width%3A1284`);
    if (!Array.isArray(res.manuscripts) || res.manuscripts.length === 0) {
      throw new Error("该章节在官网不可读，可能已结束免费公开或属于 App 限定内容");
    }
    const images = [...res.manuscripts].sort((a, b) => (a.page || 0) - (b.page || 0)).map(page => {
      if (typeof page.drmImageUrl !== "string" || !/^https?:\/\//.test(page.drmImageUrl)) {
        throw new Error("Invalid ComicWalker web manuscript URL");
      }
      const url = page.drmImageUrl.split("#")[0];
      if (page.drmMode === "raw") return `${url}#cw_web_raw`;
      if (page.drmMode !== "xor" || typeof page.drmHash !== "string" ||
          !/^[0-9a-f]{16}$/i.test(page.drmHash.slice(0, 16))) {
        throw new Error("Invalid or unsupported ComicWalker web DRM metadata");
      }
      return `${url}#cw_web_xor=${encodeURIComponent(page.drmHash)}`;
    });
    return { images };
  }

  xorImageConfig(url, key, headers) {
    const script = `(function (buffer) {
      var key = [${key.join(",")}];
      var view = ArrayBuffer.isView(buffer)
        ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        : new Uint8Array(buffer);
      for (var i = 0; i < view.length; i++) view[i] ^= key[i % key.length];
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    })`;
    return { url, headers, onResponse: async buffer => await compute(script, buffer) };
  }

  get headers() {
    const headers = {
      "X-API-Environment-Key": this.api_key,
      "User-Agent": `BookWalkerApp/${this.latestVersion} (Android 13)`,
      "Host": "mobileapp.comic-walker.com",
      "Content-Type": "application/json"
    };
    const token = this.loadData("token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  async refreshToken() {
    // Registration must not recurse through the authentication retry path.
    const headers = { ...this.headers };
    delete headers.Authorization;
    const res = await this.request(
      `${this.api_base}/v1/users`, headers, "POST", undefined, false,
    );
    const token = res.resources?.access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("Anonymous session response is missing access_token");
    }
    this.saveData("token", token);
    return token;
  }

  async request(url, headers, method = "GET", data, allowRefresh = true) {
    if (method !== "GET" && method !== "POST") {
      throw new Error(`Unsupported method: ${method}`);
    }
    if (allowRefresh && !this.loadData("token")) {
      await this.refreshToken();
      headers = { ...headers, ...this.headers };
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = method === "GET"
        ? await Network.get(url, headers)
        : await Network.post(url, headers, data);
      if (response.status === 204) return response;
      let result;
      try {
        result = JSON.parse(response.body);
      } catch (_) {
        // Never include response bodies: they can contain session data.
        throw new Error(`ComicWalker 旧 App 接口 HTTP ${response.status}: expected JSON response`);
      }
      if (allowRefresh && attempt === 0 &&
          (response.status === 401 || result?.code === "unauthorized")) {
        await this.refreshToken();
        headers = { ...headers, ...this.headers };
        continue;
      }
      if (response.status < 200 || response.status >= 300 || result?.code) {
        throw new Error(`ComicWalker 旧 App 接口 HTTP ${response.status}: ${result?.code || "request failed"}`);
      }
      return result;
    }
  }

  async init() {
    if (!this.useApp) return;
    const itunes_api = "https://itunes.apple.com/lookup?bundleId=jp.co.bookwalker.cwapp.ios&country=jp";
    try {
      const resp = await Network.get(itunes_api);
      if (resp.status === 200) {
        const version = JSON.parse(resp.body).results?.[0]?.version;
        if (typeof version === "string" && /^\d+(?:\.\d+)+$/.test(version)) {
          this.latestVersion = version;
        }
      }
    } catch (_) {
      // Version lookup is optional; keep the last known official version.
    }
    if (!this.loadData("token")) {
      try {
        await this.refreshToken();
      } catch (_) {
        // A content request retries registration and reports the actual failure.
      }
    }
  }

  explore = [
    {
      title: "カドコミ",
      type: "singlePageWithMultiPart",
      load: async () => {
        if (!this.useApp) {
          const latest = await this.webList("/series/new?", 1);
          const ranking = await this.webList("/ranking?", 1);
          return {
            "新連載（公式サイト）": latest.comics,
            "人気作品（公式サイト）": ranking.comics,
          };
        }
        const res = await this.request(
          `${this.api_base}/v2/screens/home`,
          this.headers,
        );

        const result = {};

        const newArrivals = res.resources.new_arrival_comics.map((item) =>
          new Comic({
            id: item.id,
            title: item.title,
            cover: item.thumbnail_1x1 || "",
            tags: item.comic_labels?.map((l) => l.name) || [],
          }),
        );
        result["今日の更新"] = newArrivals;

        const attention = res.resources.attention_comics.map((item) =>
          new Comic({
            id: item.comic_id,
            title: item.title,
            cover: item.image_url || "",
            tags: item.comic_labels?.map((l) => l.name) || [],
          }),
        );
        result["注目作品"] = attention;

        for (const pickup of res.resources.pickup_comics) {
            const comics = pickup.comics.map((item) =>
                new Comic({
                    id: item.id,
                    title: item.title,
                    cover: item.thumbnail_1x1 || "",
                    tags: item.comic_labels?.map((l) => l.name) || [],
                }),
            );
            result[pickup.name] = comics;
        }

        const newSerialization = res.resources.new_serialization_comics.map((item) =>
            new Comic({
                id: item.id,
                title: item.title,
                cover: item.thumbnail_1x1 || "",
                tags: item.comic_labels?.map((l) => l.name) || [],
            }),
        );
        result["新連載"] = newSerialization;


        return result;
      },
    },
  ];

  search = {
    load: async (keyword, _, page = 1) => {
      if (!this.useApp) {
        return await this.webList(`/search/keywords?keywords=${encodeURIComponent(keyword)}&sortBy=popularity`, page);
      }
      const res = await this.request(
        `${this.api_base}/v1/search/comics?keyword=${encodeURIComponent(keyword)}&limit=20&offset=${
          (page - 1) * 20
        }`,
        this.headers,
      );

      const comics = res.resources.map((item) =>
        new Comic({
          id: item.id,
          title: item.title,
          cover: item.thumbnail_1x1 || "",
          tags: [
            ...(item.authors?.map((a) => a.name) || []),
            ...(item.comic_labels?.map((l) => l.name) || []),
          ],
        })
      );
      const pageInfo = {
        hasNextPage: res.resources.length === 20,
        endCursor: null,
      };

      return {
        comics,
        maxPage: pageInfo.hasNextPage ? (page || 1) + 1 : (page || 1),
        endCursor: pageInfo.endCursor,
      };
    },
  };

  comic = {
    loadInfo: async (id) => {
      if (this.isWebComic(id)) return await this.webInfo(id);
      const res = await this.request(
        `${this.api_base}/v2/screens/comics/${id}`,
        this.headers,
      );
      const detail = res.resources.detail;

      const totalCount = res.resources.episode_total_count || 0;
      let episodes = { resources: [] };
      for (let offset = 0; offset < totalCount; offset += 100) {
        const chunk = await this.request(
          `${this.api_base}/v1/comics/${id}/episodes?offset=${offset}&limit=100&sort=asc`,
          this.headers,
        );
        episodes.resources.push(...(chunk.resources || []));
      }

      const tags = new Map();

      if (detail.authors) {
        detail.authors.forEach((a) => {
          if (!tags.has(a.role)) tags.set(a.role, []);
          tags.get(a.role).push(a.name);
        });
      }

      if (detail.comic_labels) {
        detail.comic_labels.forEach((l) => {
          if (!tags.has("Labels")) tags.set("Labels", []);
          tags.get("Labels").push(l.name);
        });
      }

      if (detail.tags) {
        detail.tags.forEach((t) => {
          if (!tags.has(t.type)) tags.set(t.type, []);
          tags.get(t.type).push(t.name);
        });
      }

      const chapters = new Map();
      for (const ep of episodes.resources) {
        let canRent = false;
        const plans = (ep.plans || []).filter((plan) =>
      plan.type !== "paid"
        );
        if (Array.isArray(plans) && plans.length > 0) {
      canRent = true;
        }
        const title = canRent ? ep.title : `❌ ${ep.title}`;
        chapters.set(ep.id, title);
      }

      return new ComicDetails({
        title: detail.title,
        subtitle: detail.authors?.map((a) => a.name).join("・") || "",
        cover: detail.thumbnail_1x1 || "",
        description: detail.story?.replace(/<br\s*\/?>/gi, "\n") || "",
        tags,
        chapters,
        updateTime: detail.next_update_at,
        url: detail.share_url,
        maxPage: totalCount,
      });
    },

    loadEp: async (comicId, epId) => {
      if (this.isWebComic(comicId)) return await this.webEpisode(epId);
      let detail = await this.request(
        `${this.api_base}/v1/episodes/${epId}`,
        this.headers,
      );
      const plans = (detail.plans || []).filter((plan) =>
        // plan.type !== "daily_video_free" &&
        plan.type !== "paid"
      );
      if (
        !Array.isArray(plans) ||
        plans.length === 0
      ) {
        throw new Error("No available rental plans after filtering");
      }
      const freePlan = plans.find((plan) => plan.type === "free");
      if (!freePlan) {
        const plan = plans[0];
        await this.request(
          `${this.api_base}/v1/users/me/rental_episodes`,
          this.headers,
          "POST",
          { episode_id: epId, reading_method: plan.type },
        );
      }
      let res = await this.request(
        `${this.api_base}/v1/screens/comics/${comicId}/episodes/${epId}/viewer`,
        this.headers,
      );
      const manuscripts = res.resources.manuscripts || [];
      return {
        images: manuscripts.map((m) => {
          if (typeof m.drm_image_url !== "string" || !m.drm_image_url ||
              typeof m.drm_hash !== "string" || !m.drm_hash) {
            throw new Error("Invalid ComicWalker manuscript image metadata");
          }
          const separator = m.drm_image_url.includes("?") ? "&" : "?";
          return `${m.drm_image_url}${separator}drm_hash=${encodeURIComponent(m.drm_hash)}`;
        }),
      };
    },

    onImageLoad: (url) => {
      const fragment = url.lastIndexOf("#");
      const metadata = fragment >= 0 ? url.slice(fragment + 1) : "";
      if (metadata === "cw_web_raw" || metadata.startsWith("cw_web_xor=")) {
        const cleanUrl = url.slice(0, fragment);
        const headers = {
          "User-Agent": this.webHeaders["User-Agent"],
          "Referer": `${this.web_base}/`,
        };
        if (metadata === "cw_web_raw") return { url: cleanUrl, headers };
        const hash = decodeURIComponent(metadata.slice("cw_web_xor=".length)).slice(0, 16);
        if (!/^[0-9a-f]{16}$/i.test(hash)) throw new Error("Invalid ComicWalker web DRM hash");
        const key = [];
        for (let i = 0; i < 8; i++) key.push(parseInt(hash.slice(i * 2, i * 2 + 2), 16));
        return this.xorImageConfig(cleanUrl, key, headers);
      }
      let drm_hash = null;
      let cleanUrl = url;
      const drmHashMatch = url.match(/[?&]drm_hash=([^&]+)/);
      if (drmHashMatch) {
        drm_hash = decodeURIComponent(drmHashMatch[1]);
        cleanUrl = url.replace(/([?&])drm_hash=[^&]+(&)?/, (match, p1, p2) => {
          if (p2) return p1;
          return "";
        }).replace(/[?&]$/, "");
      }
      cleanUrl = cleanUrl.replace(/([?&])weight=[^&]+(&)?/, (match, p1, p2) => {
        if (p2) return p1;
        return "";
      }).replace(/[?&]$/, "");

      cleanUrl = cleanUrl.replace(/([?&])height=[^&]+(&)?/, (match, p1, p2) => {
        if (p2) return p1;
        return "";
      }).replace(/[?&]$/, "");

      if (typeof drm_hash !== "string" || !/^01[0-9a-f]{16,}$/i.test(drm_hash)) {
        throw new Error("Invalid or unsupported ComicWalker drm_hash");
      }
      const key = [];
      for (let i = 0; i < 8; i++) {
        key.push(parseInt(drm_hash.slice(2 + i * 2, 4 + i * 2), 16));
      }
      // compute expects a function expression. Native Venera can pass a typed
      // array; native bridges need an ArrayBuffer with only its decoded bytes.
      const onResponseScript = `(function (buffer) {
        var key = [${key.join(",")}];
        var view = ArrayBuffer.isView(buffer)
          ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
          : new Uint8Array(buffer);
        for (var i = 0; i < view.length; i++) {
          view[i] ^= key[i % key.length];
        }
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
      })`;
      return {
        url: cleanUrl,
        headers: this.headers,
        onResponse: async (buffer)  => {
          return await compute(onResponseScript, buffer);
        }
      };
    },

    onClickTag: (namespace, tag) => {
      if (
        namespace === "漫画" || namespace === "原作" ||
        namespace === "キャラクター原案" || namespace === "著者" || namespace === "作画"
      ) {
        return {
          action: "search",
          keyword: tag,
          param: null,
        };
      }
      return null;
    },
  };
}
