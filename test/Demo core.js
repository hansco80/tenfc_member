/* =====================================================================
   TenFC 체험판 공통 모듈 (demo-core.js)
   - 실제 Supabase 대신 브라우저 메모리의 가상 DB로 동작합니다. (저장은 현재 탭 세션 동안만)
   - 모든 데이터(이름·연락처·주소 등)는 가상의 샘플이며 실제 개인정보가 없습니다.
   - 실제 서비스 페이지의 코드를 그대로 쓰므로 투표·평점·일정·집계 기능이 동일하게 동작합니다.
   ===================================================================== */
(function () {
    'use strict';
    const DB_KEY = 'tenfc_demo_db_v1';
    const USER_KEY = 'tenfc_demo_user';
    const STAT_KEY = 'tenfc_demo_stat';

    /* ---------- 샘플 데이터 ---------- */
    const pad = n => String(n).padStart(2, '0');
    const dayAt = (offsetDays, h, m) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(h, m || 0, 0, 0); return d; };
    const mmdd = d => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

    // [이름, 역할, 등급, 출생년도, 포지션, 출석수, 탈퇴]
    const PEOPLE = [
        ['김민준', 'admin', 'B+', 1983, '미드필더', 96], ['이서준', 'admin', 'B', 1985, '수비수', 90], ['박도윤', 'admin', 'B+', 1987, '공격수', 88],
        ['최하준', 'sub_admin', 'B', 1990, '미드필더', 72], ['정시우', 'sub_admin', 'B-', 1992, '수비수', 65],
        ['강지호', 'member', 'B-', 1988, '공격수', 58], ['조현우', 'member', 'C+', 1991, '미드필더', 51], ['윤서진', 'member', 'C', 1994, '수비수', 47],
        ['장도현', 'member', 'C+', 1986, '골키퍼', 44], ['임재윤', 'member', 'B-', 1995, '공격수', 41], ['한지훈', 'member', 'C', 1989, '멀티', 39],
        ['오승민', 'member', 'C-', 1982, '수비수', 36], ['서준혁', 'member', 'C+', 1997, '미드필더', 33], ['신동훈', 'member', 'B', 1993, '공격수', 30],
        ['권태민', 'member', 'C', 1990, '멀티', 27], ['황민석', 'member', 'D+', 1984, '수비수', 24], ['송재원', 'member', 'C', 2000, '미드필더', 20],
        ['안성우', 'member', 'C-', 1996, '멀티', 14],
        ['배진우', 'guest', 'C', 1995, '멀티', 3], ['문태양', 'guest', 'D+', 1999, '수비수', 2],
        ['류하늘', 'acquaintance', 'C', 1992, '멀티', 4], ['남도훈', 'acquaintance', 'C+', 1998, '공격수', 2],
        ['백승현', 'member', 'C', 1991, '멀티', 18, true]
    ];
    const SCORE = { 'A+': 10, 'A': 9.5, 'A-': 9, 'B+': 8.5, 'B': 8, 'B-': 7.5, 'C+': 7, 'C': 6.5, 'C-': 6, 'D+': 5.5, 'D': 5 };
    const FEEDBACK = ['성실하게 참여하는 멤버입니다. (샘플)', '체력이 좋고 패스가 정확합니다. (샘플)', '수비 라인 조율을 잘 해줍니다. (샘플)', '꾸준히 출석하는 멤버입니다. (샘플)'];

    function seed() {
        const db = { _seq: {}, members: [], venues: [], matches: [], match_votes: [], polls: [], poll_options: [], poll_votes: [], rating_sessions: [], rating_votes: [] };
        const next = t => (db._seq[t] = (db._seq[t] || 0) + 1);
        const ins = (t, row) => { const r = Object.assign({ id: next(t) }, row); db[t].push(r); return r; };

        PEOPLE.forEach((p, i) => {
            const [name, role, rating, birthY, position, att, gone] = p;
            const base = SCORE[rating] || 6.5;
            const history = [-3, -2, -1, 0].map((k, j) => ({ date: mmdd(dayAt(-21 + j * 7, 12)), score: Math.max(1.5, base + (j === 0 ? -0.5 : j === 1 ? 0 : j === 2 ? -0.5 : 0)) }));
            ins('members', {
                name, password: '0000', full_phone: `010-0000-${pad(i + 1).padStart(4, '0')}`, kakao_id: `demo_user${i + 1}`, photo: '',
                birth: `${birthY}.${pad((i * 5) % 12 + 1)}.${pad((i * 7) % 27 + 1)}`, address: '○○시 ○○구 (샘플 주소)', position, rating,
                join_date: `${2019 + (i % 6)}.${pad((i % 12) + 1)}.01`, role, is_withdrawn: !!gone, attended_matches: att, history,
                feedback: FEEDBACK[i % FEEDBACK.length], login_count: (i * 3) % 17, last_login_at: dayAt(-(i % 9), 21, 10).toISOString()
            });
        });

        ins('venues', { name: '다온 풋살파크 (샘플)', address: '○○시 ○○구 ○○로 123', parking_info: '건물 지하 주차장 2시간 무료 (샘플)', notes: '실내화 착용 필수, 샤워실 이용 가능 (샘플)' });
        ins('venues', { name: '리버사이드 구장 (샘플)', address: '○○시 ○○구 강변로 45', parking_info: '인근 공영주차장 이용 (샘플)', notes: '우천 시 일정 변경될 수 있어요 (샘플)' });

        const mk = (off, h, type, cost, amount, venueId, cap, status, dlOff, dlH) => ins('matches', {
            match_date: dayAt(off, h, 0).toISOString(), match_type: type, cost_type: cost, cost_amount: amount, venue_id: venueId,
            capacity: cap, deadline: dayAt(dlOff, dlH, 0).toISOString(), status
        });
        const m0 = mk(-10, 20, '정기운동', '유료', '8,000', 1, 15, '마감', -11, 22);
        const m1 = mk(-3, 20, '정기운동', '유료', '8,000', 1, 18, '마감', -4, 22);
        const m2 = mk(2, 20, '정기운동', '유료', '8,000', 1, 18, '모집중', 1, 22);
        const m3 = mk(6, 19, '플랩', '유료', '10,000', 2, 15, '모집중', 5, 22);
        const m4 = mk(9, 15, '벙개', '무료', '', 2, 10, '모집중', 8, 22);

        const regs = db.members.filter(m => ['admin', 'sub_admin', 'member'].includes(m.role) && !m.is_withdrawn);
        let tick = 0;
        const vote = (matchId, name, type, status, extra) => ins('match_votes', Object.assign({
            match_id: matchId, guest_name: name, guest_type: type, status, voted_at: new Date(Date.now() - (600 - (tick++)) * 60000).toISOString()
        }, extra || {}));
        regs.slice(0, 15).forEach(m => vote(m0.id, m.name, '정회원', '참석'));
        regs.forEach(m => vote(m1.id, m.name, '정회원', '참석'));
        regs.slice(0, 14).forEach(m => vote(m2.id, m.name, '정회원', '참석'));
        vote(m2.id, regs[14].name, '정회원', '미정'); vote(m2.id, regs[15].name, '정회원', '미정'); vote(m2.id, regs[16].name, '정회원', '불참');
        vote(m2.id, '배진우', '용병', '참석', { guest_birth: '1995', guest_phone: '010-0000-9001', guest_skill: '중', registered_by: regs[3].name });
        vote(m2.id, '류하늘', '지인', '참석', { guest_birth: '1992', guest_phone: '010-0000-9002', guest_skill: '중', registered_by: regs[5].name });
        regs.slice(2, 8).forEach(m => vote(m3.id, m.name, '정회원', '참석'));
        regs.slice(4, 8).forEach(m => vote(m4.id, m.name, '정회원', '참석'));

        // 투표 샘플
        const dl = h => dayAt(h, 23, 0).toISOString();
        const p1 = ins('polls', { title: '12월 송년회 날짜를 정해요 (샘플)', description: '연말 송년회 날짜 후보입니다. 가능한 날짜를 모두 골라주세요.', is_anonymous: false, allow_multiple: true, show_results: 'always', deadline: dl(5), status: 'open', created_by: '김민준', created_at: dayAt(-1, 10, 0).toISOString() });
        ['12/13 (토)', '12/20 (토)', '12/27 (토)'].forEach((label, i) => ins('poll_options', { poll_id: p1.id, label, sort_order: i }));
        const o1 = db.poll_options.filter(o => o.poll_id === p1.id);
        regs.slice(0, 9).forEach((m, i) => { ins('poll_votes', { poll_id: p1.id, option_id: o1[i % 3].id, voter: m.name }); if (i % 2 === 0) ins('poll_votes', { poll_id: p1.id, option_id: o1[(i + 1) % 3].id, voter: m.name }); });
        const p2 = ins('polls', { title: '새 팀 유니폼 색상 (익명 · 샘플)', description: '익명 투표 예시입니다. 누가 어떤 항목을 골랐는지 공개되지 않아요.', is_anonymous: true, allow_multiple: false, show_results: 'closed', deadline: dl(3), status: 'open', created_by: '이서준', created_at: dayAt(-2, 9, 0).toISOString() });
        ['레드', '블루', '그린'].forEach((label, i) => ins('poll_options', { poll_id: p2.id, label, sort_order: i }));
        const o2 = db.poll_options.filter(o => o.poll_id === p2.id);
        for (let i = 0; i < 8; i++) ins('poll_votes', { poll_id: p2.id, option_id: o2[i % 3 === 2 ? 0 : i % 3].id, voter: 'anon-' + (1000 + i) });
        const p3 = ins('polls', { title: '구장 변경 찬반 (마감 · 샘플)', description: '마감된 투표 예시입니다.', is_anonymous: false, allow_multiple: false, show_results: 'always', deadline: dl(-3), status: 'closed', created_by: '박도윤', created_at: dayAt(-9, 9, 0).toISOString() });
        ['찬성', '반대'].forEach((label, i) => ins('poll_options', { poll_id: p3.id, label, sort_order: i }));
        const o3 = db.poll_options.filter(o => o.poll_id === p3.id);
        regs.slice(0, 10).forEach((m, i) => ins('poll_votes', { poll_id: p3.id, option_id: o3[i < 7 ? 0 : 1].id, voter: m.name }));
        return db;
    }

    /* ---------- 가상 DB (탭 세션 동안 유지) ---------- */
    let DB;
    try { DB = JSON.parse(sessionStorage.getItem(DB_KEY) || 'null'); } catch (e) { DB = null; }
    if (!DB) DB = seed();
    const persist = () => { try { sessionStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch (e) {} };
    persist();

    const nowIso = () => new Date().toISOString();
    const clone = o => JSON.parse(JSON.stringify(o));

    class Query {
        constructor(table) { this.t = table; this.op = 'select'; this.f = []; this.ord = null; this.lim = null; this.mode = 'many'; this.rows = null; this.patch = null; this.cols = '*'; this.ret = false; this.conflict = null; }
        select(cols) { if (this.op === 'select') this.cols = cols || '*'; else this.ret = true; return this; }
        insert(rows) { this.op = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
        upsert(rows, opt) { this.op = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; this.conflict = opt && opt.onConflict ? opt.onConflict.split(',').map(s => s.trim()) : null; return this; }
        update(patch) { this.op = 'update'; this.patch = patch; return this; }
        delete() { this.op = 'delete'; return this; }
        eq(c, v) { this.f.push(r => r[c] === v || (r[c] != null && v != null && String(r[c]) === String(v))); return this; }
        neq(c, v) { this.f.push(r => r[c] !== v); return this; }
        in(c, arr) { this.f.push(r => arr.some(v => v === r[c] || String(v) === String(r[c]))); return this; }
        gt(c, v) { this.f.push(r => r[c] > v); return this; }
        gte(c, v) { this.f.push(r => r[c] >= v); return this; }
        lt(c, v) { this.f.push(r => r[c] < v); return this; }
        lte(c, v) { this.f.push(r => r[c] <= v); return this; }
        is(c, v) { this.f.push(r => (r[c] ?? null) === v); return this; }
        match(o) { Object.keys(o).forEach(k => this.eq(k, o[k])); return this; }
        order(c, opt) { this.ord = { c, asc: !(opt && opt.ascending === false) }; return this; }
        limit(n) { this.lim = n; return this; }
        single() { this.mode = 'single'; return this; }
        maybeSingle() { this.mode = 'maybe'; return this; }
        then(a, b) { return Promise.resolve().then(() => this.run()).then(a, b); }

        project(r) {
            const out = clone(r);
            const emb = /venues\(/.test(this.cols);
            if (this.t === 'matches' && emb) out.venues = clone(DB.venues.find(v => v.id === r.venue_id) || null);
            const plain = this.cols.replace(/,?\s*\w+\(\*\)/g, '').trim();
            if (!plain || plain.startsWith('*')) return out;
            const o = {}; plain.split(',').map(x => x.trim()).filter(Boolean).forEach(k => { o[k] = out[k]; });
            if (emb) o.venues = out.venues;
            return o;
        }
        finish(rows) {
            if (this.mode === 'single') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: '정확히 1개의 결과가 필요합니다.', code: 'PGRST116' } };
            if (this.mode === 'maybe') return { data: rows[0] || null, error: null };
            return { data: rows, error: null };
        }
        run() {
            const tbl = DB[this.t];
            if (!tbl) return { data: null, error: { message: `알 수 없는 테이블: ${this.t}` } };
            const matched = () => tbl.filter(r => this.f.every(fn => fn(r)));
            if (this.op === 'select') {
                let rows = matched();
                if (this.ord) { const { c, asc } = this.ord; rows = rows.slice().sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
                if (this.lim != null) rows = rows.slice(0, this.lim);
                return this.finish(rows.map(r => this.project(r)));
            }
            if (this.op === 'insert' || this.op === 'upsert') {
                const out = [];
                for (const raw of this.rows) {
                    let row = clone(raw);
                    if (this.op === 'upsert') {
                        const keys = this.conflict || ['id'];
                        const ex = tbl.find(r => keys.every(k => row[k] !== undefined && r[k] === row[k]));
                        if (ex) { Object.assign(ex, row); out.push(clone(ex)); continue; }
                    }
                    if (this.t === 'members' && tbl.some(m => m.name === row.name)) return { data: null, error: { message: `이미 등록된 이름입니다 (duplicate key): ${row.name}`, code: '23505' } };
                    DB._seq[this.t] = (DB._seq[this.t] || 0);
                    if (row.id === undefined) row.id = ++DB._seq[this.t];
                    if (['polls', 'rating_sessions', 'rating_votes'].includes(this.t) && !row.created_at) row.created_at = nowIso();
                    if (this.t === 'rating_votes' && !row.updated_at) row.updated_at = nowIso();
                    tbl.push(row); out.push(clone(row));
                }
                persist();
                return this.ret || this.mode !== 'many' ? this.finish(out) : { data: null, error: null };
            }
            if (this.op === 'update') {
                const rows = matched(); rows.forEach(r => Object.assign(r, clone(this.patch))); persist();
                return this.ret || this.mode !== 'many' ? this.finish(rows.map(r => clone(r))) : { data: null, error: null };
            }
            if (this.op === 'delete') {
                const rows = matched(); DB[this.t] = tbl.filter(r => !rows.includes(r)); persist();
                return { data: null, error: null };
            }
        }
    }

    const client = {
        from: t => new Query(t),
        rpc: async (fn, args) => {
            if (fn === 'stat_login') {
                const m = DB.members.find(x => x.name === (args.p_name || '').trim() && x.password === args.p_pw && !x.is_withdrawn && ['admin', 'sub_admin', 'member'].includes(x.role));
                return m ? { data: 'demo-token', error: null } : { data: null, error: { message: 'unauthorized' } };
            }
            return { data: null, error: null };
        }
    };
    window.supabase = { createClient: () => client };

    /* ---------- 체험용 헬퍼 ---------- */
    const members = () => DB.members;
    const currentUser = () => { const n = localStorage.getItem(USER_KEY); return n ? DB.members.find(m => m.name === n && !m.is_withdrawn) || null : null; };
    function sampleLineup() {
        const act = DB.members.filter(m => !m.is_withdrawn && ['admin', 'sub_admin', 'member'].includes(m.role));
        const admins = act.filter(m => m.role === 'admin'), rest = act.filter(m => m.role !== 'admin');
        const teams = [['레드', 0], ['블랙', 1], ['그린', 2]].map(([c, i]) => `⚽ ${i + 1}팀 [${c}]\n` + [admins[i], ...rest.filter((_, k) => k % 3 === i).slice(0, 5)].map(m => m.name).join(', '));
        return teams.join('\n\n');
    }
    function loginAs(name) {
        if (name) {
            localStorage.setItem(USER_KEY, name);
            const m = DB.members.find(x => x.name === name);
            if (m && ['admin', 'sub_admin', 'member'].includes(m.role)) localStorage.setItem(STAT_KEY, 'demo-token'); else localStorage.removeItem(STAT_KEY);
        } else { localStorage.removeItem(USER_KEY); localStorage.removeItem(STAT_KEY); }
        location.reload();
    }
    function reset() { sessionStorage.removeItem(DB_KEY); location.reload(); }
    window.DEMO = { members, currentUser, sampleLineup, loginAs, reset, names: () => DB.members.filter(m => !m.is_withdrawn).map(m => m.name) };

    /* ---------- 상단 체험 바 + 로그인 화면 빠른 입장 ---------- */
    const PERSONAS = [['김민준', '주관리자 A'], ['이서준', '주관리자 B'], ['박도윤', '주관리자 C'], ['최하준', '부관리자'], ['강지호', '정회원'], ['배진우', '용병'], ['류하늘', '지인'], ['', '비회원 (로그아웃)']];
    document.addEventListener('DOMContentLoaded', () => {
        const cur = localStorage.getItem(USER_KEY) || '';
        const css = document.createElement('style');
        css.textContent = 'body{padding-top:3.2rem !important}#tf-demo-bar{position:fixed;top:0;left:0;right:0;z-index:200;background:#f59e0b;color:#0f172a;font-size:12px;font-weight:700;padding:6px 10px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4)}#tf-demo-bar select,#tf-demo-bar button{font-size:12px;font-weight:700;border-radius:8px;padding:3px 8px;border:1px solid #92400e;background:#fff7ed;color:#0f172a;cursor:pointer}';
        document.head.appendChild(css);
        const bar = document.createElement('div');
        bar.id = 'tf-demo-bar';
        bar.innerHTML = `<span>🧪 TenFC 체험판 · 모든 데이터는 가상이며 이 탭을 닫으면 사라집니다</span>
            <label>체험 등급 <select id="demo-persona">${PERSONAS.map(([n, l]) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${l}${n ? ' · ' + n : ''}</option>`).join('')}</select></label>
            <button id="demo-reset">🔄 데이터 초기화</button>`;
        document.body.prepend(bar);
        document.getElementById('demo-persona').addEventListener('change', e => loginAs(e.target.value));
        document.getElementById('demo-reset').addEventListener('click', () => { if (confirm('체험 중 입력한 내용을 모두 지우고 처음 상태로 되돌릴까요?')) reset(); });

        const lc = document.getElementById('login-container');
        if (lc && !lc.dataset.demoPanel) {
            lc.dataset.demoPanel = '1';
            const panel = document.createElement('div');
            panel.className = 'mt-4 p-3 rounded-xl border border-amber-500/40 bg-amber-500/5';
            panel.innerHTML = `<p class="text-xs text-amber-300 font-bold mb-2">🧪 체험 계정으로 바로 입장 <span class="text-slate-400 font-normal">(직접 입력 시 이름 / 비밀번호 0000)</span></p>
                <div class="grid grid-cols-2 gap-2">${PERSONAS.filter(p => p[0]).map(([n, l]) => `<button type="button" data-demo-user="${n}" class="py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold">${l}</button>`).join('')}</div>`;
            lc.appendChild(panel);
            panel.querySelectorAll('[data-demo-user]').forEach(b => b.addEventListener('click', () => loginAs(b.dataset.demoUser)));
        }
    });
})();
