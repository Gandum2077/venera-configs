class HComic extends ComicSource {
    // Name of the source
    name = "H-Comic"

    // Unique id of the source
    key = "hcomic"

    version = "1.4.0"

    minAppVersion = "1.6.0"

    // Update url
    url = "https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/hcomic.js"

    baseUrl = "https://h-comic.com"

    apiUrl = "https://api.h-comic.com/api"

    authClientId = "06o2Ynemb0DbDy8RBImlEGbyta1gT7mS"
    authGeneration = 0

    account = {
        // Public Venera uses custom fields, which do not persist the password.
        // Keep the ordinary entry for hosts that supported the earlier source.
        login: typeof secureRandomBytes === "function"
            ? async (username, password) => {
                try { return await this.loginWithTicket(username, password); }
                catch (error) { throw this.nativeLoginFailure(error); }
            }
            : null,
        storeCredentials: false,
        loginWithCookies: {
            get fields() {
                return typeof secureRandomBytes === "function" ? undefined : ["用户名", "密码"];
            },
            validate: async (values) => {
                try {
                    if (!Array.isArray(values) || values.length !== 2) throw this.loginError('auth_required');
                    await this.loginWithTicket(values[0], values[1]);
                    return true;
                } catch (error) {
                    const failure = this.nativeLoginFailure(error);
                    // The public parser logs evaluated JS on an escaped exception.
                    // Only fixed messages may leave this source; never reject here.
                    try { UI.showMessage(failure.message); } catch (_) {}
                    return false;
                }
            },
        },
        onLoginCancel: () => {
            const run = this.ticketLoginRun;
            if (run && (run.generation === this.authGeneration ||
                (run.attemptId && run.attemptId === this.authAttemptId))) {
                this.authGeneration++;
                if (run.attemptId && this.loadData("oauthSession")?.loginAttemptId === run.attemptId) {
                    this.clearTokens();
                    this.deleteData("account");
                }
            }
        },
        loginWithWebview: {
            // Older Venera builds retain the existing website login flow.
            url: "https://h-comic.com/favourites",
            oauth: {
                authorizationEndpoint: "https://h-comic.auth0.com/authorize",
                clientId: "06o2Ynemb0DbDy8RBImlEGbyta1gT7mS",
                redirectUri: "https://h-comic.com",
                scope: "openid profile email offline_access",
                parameters: { audience: "https://h-comic.auth0.com/api/v2/" },
            },
            // The OAuth bridge generates and validates fresh state/PKCE, then
            // waits for this native (no Origin header) exchange before login succeeds.
            onAuthCode: async (grant) => {
                if (!grant || typeof grant.code !== "string" || !grant.code ||
                    grant.code.length > 2048 || grant.redirectUri !== this.baseUrl ||
                    typeof grant.attemptId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(grant.attemptId) ||
                    typeof grant.codeVerifier !== "string" ||
                    !/^[A-Za-z0-9._~-]{43,128}$/.test(grant.codeVerifier)) {
                    throw "Invalid H-Comic OAuth callback";
                }
                const generation = ++this.authGeneration;
                this.authAttemptId = grant.attemptId;
                const pending = (async () => {
                    const data = await this.oauthRequest({
                        grant_type: "authorization_code",
                        code: grant.code,
                        code_verifier: grant.codeVerifier,
                        redirect_uri: grant.redirectUri,
                    });
                    if (generation !== this.authGeneration) throw "H-Comic 登录状态已失效，请重新登录";
                    const session = this.tokenSession(data, null);
                    if (!session.refreshToken) throw "H-Comic 未返回刷新令牌，请重新登录";
                    session.loginAttemptId = grant.attemptId;
                    this.saveData("oauthSession", session);
                    this.deleteData("token");
                    this.deleteData("_localStorage");
                    return "ok";
                })();
                this.authExchange = pending;
                try { return await pending; }
                finally { if (this.authExchange === pending) this.authExchange = null; }
            },
            onAuthCancel: async (attempt) => {
                if (attempt && attempt.attemptId === this.authAttemptId) {
                    this.authGeneration++;
                    if (this.loadData("oauthSession")?.loginAttemptId === attempt.attemptId) this.clearTokens();
                }
            },
            checkStatus: (url, title) => {
                if (/^https:\/\/h-comic\.auth0\.com\//.test(url)) this.webLoginStarted = true;
                return this.webLoginStarted === true &&
                    /^https:\/\/h-comic\.com\/favourites(?:[?#]|$)/.test(url);
            },
            onLoginSuccess: () => {
                const storage = this.loadData("_localStorage") || {};
                const cookie = Network.getCookies(this.baseUrl).find(c => c.name === "auth0_token");
                let token = cookie ? decodeURIComponent(cookie.value) : storage.auth0_token;
                if (typeof token === "string" && token.startsWith('"')) token = JSON.parse(token);
                if (typeof token !== "string" || !token) {
                    this.deleteData("_localStorage");
                    throw "未取得登录令牌，请完成网页登录后再打开收藏页";
                }
                this.authGeneration++;
                this.clearTokens();
                this.saveData("token", token);
                this.deleteData("_localStorage");
                this.webLoginStarted = false;
            },
        },
        logout: () => {
            this.authGeneration++;
            this.clearTokens();
            this.deleteData("account");
            this.deleteData("_localStorage");
            this.webLoginStarted = false;
            Network.deleteCookies(this.baseUrl);
            Network.deleteCookies("https://h-comic.auth0.com");
        },
    }

    loginError(category) {
        const messages = {
            network_error: "H-Comic 登录网络请求失败，请检查网络后重试",
            rate_limited: "H-Comic 登录请求过多，请稍后重试",
            auth_required: "H-Comic 账号或密码验证未通过，请检查后重试或使用网页登录",
            interactive_required: "H-Comic 登录需要额外验证，请使用网页登录",
            parse_error: "H-Comic 登录响应无法识别，请使用网页登录",
            cancelled: "H-Comic 登录已取消或过期，请重新登录",
            busy: "H-Comic 登录正在进行，请稍后重试",
        };
        const error = new Error(messages[category] || messages.parse_error);
        error.category = Object.prototype.hasOwnProperty.call(messages, category) ? category : 'parse_error';
        return error;
    }

    nativeLoginFailure(reason) {
        if (reason && ['network_error', 'rate_limited', 'auth_required', 'interactive_required', 'parse_error', 'cancelled', 'busy'].includes(reason.category)) {
            return this.loginError(reason.category);
        }
        if (reason === 'H-Comic OAuth network request failed') return this.loginError('network_error');
        if (reason === 'H-Comic OAuth status: 429' || reason === 'Invalid H-Comic OAuth response (status: 429)') return this.loginError('rate_limited');
        if (['H-Comic OAuth status: 401', 'H-Comic OAuth status: 403', 'Invalid H-Comic OAuth response (status: 401)', 'Invalid H-Comic OAuth response (status: 403)'].includes(reason)) return this.loginError('auth_required');
        if (reason === 'H-Comic 登录状态已失效，请重新登录') return this.loginError('auth_required');
        return this.loginError('parse_error');
    }

    authRequiresInteraction(document) {
        return !!document.querySelector('.g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], input[autocomplete="one-time-code"], input[name="otp"], input[name="captcha"], input[name="h-captcha-response"], input[name="cf-turnstile-response"], textarea[name="g-recaptcha-response"]');
    }

    authFailureCategory(code, status) {
        if (status === 429 || ['too_many_requests', 'too_many_attempts'].includes(code)) return 'rate_limited';
        if (['mfa_required', 'mfa_registration_required', 'interaction_required', 'consent_required', 'captcha_required', 'password_leaked', 'requires_verification'].includes(code)) return 'interactive_required';
        if (status === 401 || status === 403 || ['access_denied', 'invalid_grant', 'invalid_user_password', 'login_required', 'blocked_user'].includes(code)) return 'auth_required';
        return 'parse_error';
    }

    async ticketRequest(method, url, body, headers) {
        let response;
        try {
            response = await Network.sendRequest(method, url, headers || {}, body || null, {
                maskDataInLog: true, maskResponseInLog: true, maskQueryInLog: true,
                maskHeadersInLog: ['Cookie', 'cookie', 'Authorization', 'authorization'],
            });
        } catch (_) { throw this.loginError('network_error'); }
        if (!response || response.error || !Number.isInteger(response.status) || response.status <= 0) throw this.loginError('network_error');
        if (response.status !== 200) {
            let code;
            try { code = JSON.parse(response.body).error; }
            catch (_) {
                if (response.status === 403 && typeof response.body === 'string' && /<html[\s>]/i.test(response.body)) {
                    throw this.loginError('interactive_required');
                }
            }
            throw this.loginError(this.authFailureCategory(code, response.status));
        }
        if (typeof response.body !== 'string') throw this.loginError('parse_error');
        return response.body;
    }

    ticketAuthorizationCode(body, expectedState) {
        const document = new HtmlDocument(body);
        try {
            if (this.authRequiresInteraction(document)) throw this.loginError('interactive_required');
            const forms = document.querySelectorAll('form');
            if (forms.length !== 1) throw this.loginError('parse_error');
            const form = forms[0];
            const attributes = form.attributes;
            if (![this.baseUrl, this.baseUrl + '/'].includes(attributes.action) ||
                String(attributes.method || '').toLowerCase() !== 'post') throw this.loginError('parse_error');
            const states = form.querySelectorAll('input[name="state"]');
            const codes = form.querySelectorAll('input[name="code"]');
            const errors = form.querySelectorAll('input[name="error"]');
            if (states.length !== 1 || String(states[0].attributes.type || '').toLowerCase() !== 'hidden' ||
                states[0].attributes.value !== expectedState) throw this.loginError('parse_error');
            if (errors.length) {
                if (errors.length !== 1 || codes.length) throw this.loginError('parse_error');
                throw this.loginError(this.authFailureCategory(errors[0].attributes.value, 200));
            }
            if (codes.length !== 1 || String(codes[0].attributes.type || '').toLowerCase() !== 'hidden' ||
                typeof codes[0].attributes.value !== 'string' || !codes[0].attributes.value || codes[0].attributes.value.length > 2048) {
                throw this.loginError('parse_error');
            }
            return codes[0].attributes.value;
        } finally { document.dispose(); }
    }

    async loginWithTicket(username, password) {
        if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) throw this.loginError('auth_required');
        if (this.nativeLoginPromise) throw this.loginError('busy');
        const run = {generation: ++this.authGeneration, attemptId: null};
        this.ticketLoginRun = run;
        const pending = (async () => {
            const body = await this.ticketRequest('POST', 'https://h-comic.auth0.com/co/authenticate', JSON.stringify({
                client_id: this.authClientId,
                credential_type: 'http://auth0.com/oauth/grant-type/password-realm',
                realm: 'Username-Password-Authentication', username, password,
            }), {'Content-Type': 'application/json', Origin: this.baseUrl});
            if (run.generation !== this.authGeneration) throw this.loginError('cancelled');
            let auth;
            try { auth = JSON.parse(body); } catch (_) { throw this.loginError('parse_error'); }
            if (auth && auth.error) throw this.loginError(this.authFailureCategory(auth.error, 200));
            if (!auth || typeof auth.login_ticket !== 'string' || !auth.login_ticket || auth.login_ticket.length > 4096 ||
                /[\u0000-\u0020]/.test(auth.login_ticket) || typeof auth.co_verifier !== 'string' ||
                auth.co_verifier.length < 32 || auth.co_verifier.length > 2048 || /[\u0000-\u0020]/.test(auth.co_verifier)) throw this.loginError('parse_error');
            // The public host has no CSPRNG API. Auth0's private per-login proof
            // supplies the seed; its minimum entropy is not a published contract.
            const encode = buffer => Convert.encodeBase64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const derive = label => encode(Convert.sha256(Convert.encodeUtf8(label + String.fromCharCode(0) + auth.co_verifier)));
            const verifier = derive('hcomic.pkce.v1');
            const state = derive('hcomic.state.v1');
            const fields = {
                client_id: this.authClientId, redirect_uri: this.baseUrl,
                response_type: 'code', response_mode: 'form_post', scope: 'openid profile email offline_access',
                audience: 'https://h-comic.auth0.com/api/v2/', login_ticket: auth.login_ticket,
                state, code_challenge: encode(Convert.sha256(Convert.encodeUtf8(verifier))), code_challenge_method: 'S256',
            };
            const query = Object.keys(fields).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])).join('&');
            const html = await this.ticketRequest('GET', 'https://h-comic.auth0.com/authorize?' + query);
            if (run.generation !== this.authGeneration) throw this.loginError('cancelled');
            const code = this.ticketAuthorizationCode(html, state);
            run.attemptId = state;
            this.nativeLoginAttemptId = state;
            return await this.account.loginWithWebview.onAuthCode({
                code, codeVerifier: verifier, redirectUri: this.baseUrl, attemptId: state,
            });
        })();
        this.nativeLoginPromise = pending;
        this.authExchange = pending;
        try { return await pending; }
        finally {
            if (this.nativeLoginPromise === pending) this.nativeLoginPromise = null;
            if (this.authExchange === pending) this.authExchange = null;
        }
    }

    expireSession() {
        this.clearTokens();
        this.deleteData('account');
    }

    clearTokens() {
        this.deleteData("oauthSession");
        this.deleteData("token");
        this.deleteData("refreshToken");
        this.deleteData("tokenExpiresAt");
    }

    tokenSession(data, previousRefreshToken) {
        if (!data || typeof data.access_token !== "string" || !data.access_token ||
            !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
            (data.token_type !== undefined && (typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer")) ||
            (data.refresh_token !== undefined && (typeof data.refresh_token !== "string" || !data.refresh_token))) {
            throw "Invalid H-Comic token response";
        }
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || previousRefreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        };
    }

    async oauthRequest(fields) {
        const values = { client_id: this.authClientId, ...fields };
        const body = Object.keys(values).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(values[k])}`).join('&');
        let res;
        try {
            res = await Network.sendRequest("POST", "https://h-comic.auth0.com/oauth/token", {
                "Content-Type": "application/x-www-form-urlencoded",
            }, body, { followRedirects: false, maskDataInLog: true, maskResponseInLog: true, maskHeadersInLog: ["Cookie", "cookie"] });
        } catch (_) { throw "H-Comic OAuth network request failed"; }
        if (!res || res.error || !Number.isInteger(res.status) || res.status <= 0) {
            throw "H-Comic OAuth network request failed";
        }
        let data;
        try { data = JSON.parse(res.body); }
        catch (_) { throw `Invalid H-Comic OAuth response (status: ${res.status})`; }
        if (res.status < 200 || res.status >= 300) {
            if (data && data.error === "invalid_grant") throw "H-Comic 登录状态已失效，请重新登录";
            throw `H-Comic OAuth status: ${res.status}`;
        }
        return data;
    }

    async refreshAccessToken(failedToken) {
        const current = this.loadData("oauthSession");
        if (failedToken && current && current.accessToken && current.accessToken !== failedToken) return current.accessToken;
        if (this.refreshPromise && this.refreshGeneration === this.authGeneration) return this.refreshPromise;
        if (!current || !current.refreshToken) throw "H-Comic 登录状态已失效，请重新登录";
        const generation = this.authGeneration;
        const pending = (async () => {
            let data;
            try {
                data = await this.oauthRequest({ grant_type: "refresh_token", refresh_token: current.refreshToken });
            } catch (error) {
                if (generation === this.authGeneration && error === "H-Comic 登录状态已失效，请重新登录") this.expireSession();
                throw error;
            }
            if (generation !== this.authGeneration) throw "H-Comic 登录状态已失效，请重新登录";
            const session = this.tokenSession(data, current.refreshToken);
            if (current.loginAttemptId) session.loginAttemptId = current.loginAttemptId;
            // Persist the access/refresh pair together, including rotated refresh tokens.
            this.saveData("oauthSession", session);
            return session.accessToken;
        })();
        this.refreshGeneration = generation;
        this.refreshPromise = pending;
        try { return await pending; }
        finally { if (this.refreshPromise === pending) this.refreshPromise = null; }
    }

    async apiRequest(method, path, data) {
        if (this.authExchange) await this.authExchange;
        const generation = this.authGeneration;
        const session = this.loadData("oauthSession");
        let token = session ? session.accessToken : this.loadData("token");
        if (session && session.refreshToken && (!token ||
            (Number.isFinite(session.expiresAt) && session.expiresAt <= Date.now() / 1000 + 60))) {
            token = await this.refreshAccessToken();
        }
        if (!token) { this.expireSession(); throw "H-Comic 登录状态已失效，请重新登录"; }
        const request = async value => {
            const res = await Network.sendRequest(method, this.apiUrl + path, {
            "Authorization": `Bearer ${value}`,
            "Content-Type": "application/json",
        }, data === undefined ? null : JSON.stringify(data), {
            maskDataInLog: true, maskResponseInLog: true,
            maskHeadersInLog: ["Authorization", "authorization", "Cookie", "cookie"],
            });
            if (!res || res.error || !Number.isInteger(res.status) || res.status <= 0) {
                throw "H-Comic API network request failed";
            }
            return res;
        };
        let res = await request(token);
        if (generation !== this.authGeneration) throw "H-Comic 登录状态已失效，请重新登录";
        if (res.status === 401 && this.loadData("oauthSession")?.refreshToken) {
            token = await this.refreshAccessToken(token);
            res = await request(token);
            if (generation !== this.authGeneration) throw "H-Comic 登录状态已失效，请重新登录";
        }
        if (res.status === 401) {
            const latest = this.loadData("oauthSession");
            if (!latest || latest.accessToken === token) this.expireSession();
            throw "H-Comic 登录状态已失效，请重新登录";
        }
        if (res.status < 200 || res.status >= 300) throw `H-Comic API status: ${res.status}`;
        if (res.status === 204) return null;
        try { return JSON.parse(res.body); }
        catch (_) { throw "Invalid H-Comic API response"; }
    }

    async getComicRecord(id) {
        const parts = id.split('|');
        const html = await this.getHtml(`${this.baseUrl}/comics/${encodeURIComponent(parts.slice(1).join('|') || "view")}/1?id=${encodeURIComponent(parts[0])}`);
        const data = this.extractData(html);
        if (!data || !data.comic || !data.comic._id) {
            throw "Failed to resolve H-Comic favorite ID";
        }
        return data.comic;
    }

    favorites = {
        multiFolder: false,
        loadComics: async (page, folder) => {
            const result = await this.apiRequest("GET", `/favourites?page=${page}`);
            if (!result || !Array.isArray(result.docs) ||
                !Number.isInteger(result.pages) || result.pages < 0) {
                throw "Invalid H-Comic favorites response";
            }
            const comics = result.docs.map(entry => {
                if (!entry.comic || typeof entry.comic !== "object") {
                    throw "Invalid H-Comic favorite comic";
                }
                return this.parseComic(entry.comic);
            });
            return { comics, maxPage: Math.max(1, result.pages) };
        },
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            const c = await this.getComicRecord(comicId);
            if (isAdding) await this.apiRequest("POST", "/favourites", { comicId: c._id });
            else await this.apiRequest("DELETE", `/favourites/${encodeURIComponent(c._id)}`);
            return "ok";
        },
    }

    /**
     * [Optional] init function
     */
    init() {
        // Remove credentials retained by older ordinary-login implementations.
        // Only inspect the container, never read or copy its credential elements.
        if (Array.isArray(this.loadData('account'))) {
            const session = this.loadData('oauthSession');
            if (session?.accessToken || this.loadData('token')) this.saveData('account', 'ok');
            else this.deleteData('account');
        }
    }

    async getHtml(url) {
        let res = await Network.get(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        return res.body;
    }

    extractData(html) {
        // Look for the SvelteKit data script
        // Matches: data: [null, { ... }], form:
        let match = html.match(/data:\s*\[null,\s*(\{[\s\S]*?\})\s*\]\s*,\s*form:/);
        if (match) {
            let jsonStr = match[1];
            try {
                // Try to fix unquoted keys: { key: value } -> { "key": value }
                let fixedJsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                let json = JSON.parse(fixedJsonStr);
                return json.data;
            } catch (e) {
                console.error("Failed to parse JSON", e);
                try {
                    // Fallback to new Function if JSON.parse fails (e.g. trailing commas)
                    let fn = new Function("return " + jsonStr);
                    let json = fn();
                    return json.data;
                } catch (e2) {
                    console.error("Failed to eval", e2);
                }
            }
        }
        return null;
    }

    extractMaxPage(html) {
        let match = html.match(/name="page"[^>]*max="(\d+)"/);
        if (match) {
            return parseInt(match[1]);
        }
        return 1;
    }

    parseComic(c) {
        let title = c.title.display || c.title.pretty || c.title.japanese || c.title.english;
        let tags = c.tags ? c.tags.map(t => t.name_zh || t.name) : [];
        let updateTime = null;
        if (c.upload_date) {
            let date = new Date(c.upload_date * 1000).toISOString().split('T')[0];
            tags.push(date);
            updateTime = date;
        }
        return new Comic({
            id: `${c.id}|${title}`,
            title: title,
            subTitle: c.title.english,
            cover: c.thumbnail || `https://h-comic.link/api/${c.comic_source}/${c.media_id}`,
            favoriteId: c._id,
            tags: tags,
            description: "",
            updateTime: updateTime
        });
    }

    // explore page list
    explore = [
        {
            // title of the page.
            title: "h-comic",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPartPage",

            /**
             * load function
             * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
             * @returns {{}}
             */
            load: async (page) => {
                let html = await this.getHtml(this.baseUrl);
                let data = this.extractData(html);
                if (!data || !data.comics) return [];
                
                let comics = data.comics.map(c => this.parseComic(c));
                return [{ title: "随机漫画", comics }];
            }
        }
    ]

    // categories
    category = {
        /// title of the category page
        title: "H-Comic",
        parts: [
            {
                // title of the part
                name: "热门TAG",

                // fixed or random or dynamic
                type: "fixed",

                categories: [
                    { label: "全部", target: { page: "category", attributes: { category: "全部" } } },
                    { label: "全彩", target: { page: "category", attributes: { category: "全彩", param: "全彩" } } },
                    { label: "無修正", target: { page: "category", attributes: { category: "無修正", param: "無修正" } } },
                    { label: "蘿莉", target: { page: "category", attributes: { category: "蘿莉", param: "蘿莉" } } },
                    { label: "制服", target: { page: "category", attributes: { category: "制服", param: "制服" } } },
                    { label: "巨乳", target: { page: "category", attributes: { category: "巨乳", param: "巨乳" } } },
                    { label: "黑絲 / 白襪", target: { page: "category", attributes: { category: "黑絲 / 白襪", param: "黑絲 / 白襪" } } },
                    { label: "NTR", target: { page: "category", attributes: { category: "NTR", param: "netorare" } } },
                    { label: "足交 / 腳交", target: { page: "category", attributes: { category: "足交 / 腳交", param: "footjob" } } },
                    { label: "女學生", target: { page: "category", attributes: { category: "女學生", param: "女學生" } } },
                    { label: "眼鏡控", target: { page: "category", attributes: { category: "眼鏡控", param: "眼鏡控" } } },
                    { label: "口交", target: { page: "category", attributes: { category: "口交", param: "口交" } } },
                    { label: "正太控", target: { page: "category", attributes: { category: "正太控", param: "正太控" } } },
                    { label: "年上", target: { page: "category", attributes: { category: "年上", param: "年上" } } },
                    { label: "亂倫", target: { page: "category", attributes: { category: "亂倫", param: "亂倫" } } },
                    { label: "熟女 / 人妻", target: { page: "category", attributes: { category: "熟女 / 人妻", param: "熟女 / 人妻" } } },
                    { label: "同志 BL", target: { page: "category", attributes: { category: "同志 BL", param: "同志 BL" } } },
                    { label: "黑肉", target: { page: "category", attributes: { category: "黑肉", param: "黑肉" } } },
                    { label: "泳裝", target: { page: "category", attributes: { category: "泳裝", param: "泳裝" } } },
                    { label: "手淫", target: { page: "category", attributes: { category: "手淫", param: "手淫" } } },
                    { label: "肌肉", target: { page: "category", attributes: { category: "肌肉", param: "肌肉" } } },
                    { label: "姐姐 / 妹妹", target: { page: "category", attributes: { category: "姐姐 / 妹妹", param: "姐姐 / 妹妹" } } },
                    { label: "捆綁", target: { page: "category", attributes: { category: "捆綁", param: "捆綁" } } },
                    { label: "調教", target: { page: "category", attributes: { category: "調教", param: "調教" } } },
                    { label: "催眠", target: { page: "category", attributes: { category: "催眠", param: "催眠" } } },
                    { label: "露出", target: { page: "category", attributes: { category: "露出", param: "露出" } } },
                    { label: "群交", target: { page: "category", attributes: { category: "群交", param: "群交" } } },
                    { label: "肛交", target: { page: "category", attributes: { category: "肛交", param: "肛交" } } },
                    { label: "獸交", target: { page: "category", attributes: { category: "獸交", param: "獸交" } } }
                ]
            }
        ],
        // enable ranking page
        enableRankingPage: false,
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
            let sort = options[0];
            let path = sort === "random" ? "/random" : "/";
            
            let url = `${this.baseUrl}${path}?page=${page}&q=`;

            if (param) {
                url += `&tag=${encodeURIComponent(param)}`;
            } else {
                url += `&tag=`;
            }

            let html = await this.getHtml(url);
            let data = this.extractData(html);
            let maxPage = sort === "random" ? null : this.extractMaxPage(html);

            if (!data || !data.comics) return { comics: [], maxPage: page };

            let comics = data.comics.map(c => this.parseComic(c));
            
            return {
                comics: comics,
                maxPage: maxPage
            }
        },
        // [Optional] provide options for category comic loading
        optionList: [
            {
                options: [
                    "latest-最近更新",
                    "random-随机刷新"
                ]
            }
        ],
        ranking: {
            options: [],
            load: async (option, page) => {
                return { comics: [], maxPage: 0 };
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
            // Placeholder for search
            let url = `${this.baseUrl}/?q=${encodeURIComponent(keyword)}&tag=&page=${page}`;
            let html = await this.getHtml(url);
            let data = this.extractData(html);
            let maxPage = this.extractMaxPage(html);

            if (!data || !data.comics) return { comics: [], maxPage: page };

            let comics = data.comics.map(c => this.parseComic(c));

            return { comics, maxPage };
        },
        optionList: [],
        enableTagsSuggestions: false,
    }

    /// single comic related
    comic = {
        loadInfo: async (id) => {
            let realId = id;
            let title_temp = "view";
            if (id.includes('|')) {
                let parts = id.split('|');
                realId = parts[0];
                title_temp = parts.slice(1).join('|');
            }

            let url = `${this.baseUrl}/comics/${encodeURIComponent(title_temp)}/1?id=${realId}`;
            let html = await this.getHtml(url);
            let data = this.extractData(html);
            
            if (!data || !data.comic) throw "Failed to load comic info";
            let c = data.comic;

            let title = c.title.display || c.title.pretty || c.title.japanese || c.title.english;
            let subTitle = c.title.english;
            
            let cover = c.thumbnail;
            if (!cover && c.comic_source && c.media_id) {
                cover = `https://h-comic.link/api/${c.comic_source}/${c.media_id}/pages/1`;
            }

            let tags = {};
            if (c.tags) {
                tags["标签"] = c.tags.map(t => t.name_zh || t.name);
            }
            
            let updateTime = null;
            if (c.upload_date) {
                let date = new Date(c.upload_date * 1000).toISOString().split('T')[0];
                tags["日期"] = [date];
                updateTime = date;
            }

            let description = c.title.japanese || "";

            // Encode source, media_id, num_pages into chapter ID
            let chapterId = `${c.comic_source}|${c.media_id}|${c.num_pages}`;

            let chapters = new Map();
            let group = new Map();
            group.set(chapterId, "全一话");
            chapters.set("章节", group);

            return new ComicDetails({
                title: title,
                subTitle: subTitle,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                updateTime: updateTime
            });
        },
        loadEp: async (comicId, epId) => {
            let parts = epId.split('|');
            let source = parts[0];
            let mediaId = parts[1];
            let numPages = parseInt(parts[2]);

            let images = [];
            for (let i = 1; i <= numPages; i++) {
                images.push(`https://h-comic.link/api/${source}/${mediaId}/pages/${i}`);
            }

            return { images: images };
        },
        onClickTag: (namespace, tag) => {
            return {
                page: "category",
                attributes: {
                    category: "tag",
                    param: tag
                }
            };
        },
        link: {
            domains: ['h-comic.com'],
            linkToId: (url) => {
                let idMatch = url.match(/id=(\d+)/);
                let titleMatch = url.match(/\/comics\/([^/]+)/);
                if (idMatch) {
                    let id = idMatch[1];
                    let title = titleMatch ? decodeURIComponent(titleMatch[1]) : "view";
                    return `${id}|${title}`;
                }
                return null;
            }
        },
        enableTagsTranslate: false,
    }
}
