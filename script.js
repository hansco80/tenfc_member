const SUPABASE_URL = 'https://bxuiwomkpgqsbyaagmlp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mXkGsaxwwfnnAR3lpE8T1A_n0kiPdZj';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ratingHierarchy = ["F-", "F", "F+", "E-", "E", "E+", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];

const scoreMap = { 
    "A+": 10.0, "A": 9.5, "A-": 9.0, 
    "B+": 8.5,  "B": 8.0,  "B-": 7.5, 
    "C+": 7.0,  "C": 6.5,  "C-": 6.0, 
    "D+": 5.5,  "D": 5.0,  "D-": 4.5, 
    "E+": 4.0,  "E": 3.5,  "E-": 3.0, 
    "F+": 2.5,  "F": 2.0,  "F-": 1.5 
};

const blindRatings = ["D-", "E+", "E", "E-", "F+", "F", "F-"];

let teamTotalMatches = 0;
let activeRegularMemberCount = 0;
let membersData = [];
let matchLogsData = [];
let currentUser = null;
let myChart = null;
let gradeCountChartInstance = null;

let currentSortField = 'birth';
let currentSortOrder = 'asc';
let restrictedSortField = 'birth';
let restrictedSortOrder = 'asc';

function getUpdatedHistory(history, newScore) {
    let historyArr = Array.isArray(history) ? [...history] : [];
    const now = new Date();
    const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    const existingIdx = historyArr.findIndex(h => h.date === todayStr);
    if (existingIdx !== -1) {
        historyArr[existingIdx].score = newScore;
    } else {
        historyArr.push({ date: todayStr, score: newScore });
    }
    return historyArr;
}

async function fetchMembersFromSupabase() {
    try {
        const { data, error } = await supabaseClient.from('test_members').select('*');
        if (error) { console.error("Supabase 조회 에러:", error); return false; }
        if (data && data.length > 0) {
            membersData = data.map(m => ({
                id: m.id,
                name: m.name,
                password: m.password,
                fullPhone: m.full_phone || "",
                kakaoId: m.kakao_id || "",
                photo: m.photo || "",
                birth: m.birth || "",
                address: m.address || "",
                position: m.position || "",
                rating: m.rating || "C",
                joinDate: m.join_date || "",
                role: m.role || "member",
                isWithdrawn: m.is_withdrawn || false,
                attendedMatches: m.attended_matches || 0,
                wins: m.wins || 0,
                draws: m.draws || 0,
                losses: m.losses || 0,
                goalsFor: m.goals_for || 0,
                goalsAgainst: m.goals_against || 0,
                captainCount: m.captain_count || 0,
                bestTeamCount: m.best_team_count || 0,
                history: m.history ? (typeof m.history === 'string' ? JSON.parse(m.history) : m.history) : [],
                feedback: m.feedback || ""
            }));

            let maxAtt = Math.max(...membersData.map(m => m.attendedMatches));
            teamTotalMatches = maxAtt > 0 ? maxAtt : 0;
            activeRegularMemberCount = membersData.filter(m => !m.isWithdrawn && (m.role === 'member' || m.role === 'admin' || m.role === 'sub_admin')).length;
        }

        const { data: lData, error: lErr } = await supabaseClient.from('match_logs').select('*').order('id', { ascending: false });
        if (!lErr && lData) { matchLogsData = lData; }
        return true;
    } catch (err) { console.error("데이터 로딩 실패:", err); return false; }
}

async function initApp() {
    const success = await fetchMembersFromSupabase();
    if (!success) return;

    const urlParams = new URLSearchParams(window.location.search);
    const viewUserName = urlParams.get('view');
    if (viewUserName) {
        const savedUserName = localStorage.getItem('tenfc_logged_user');
        const loggedUser = membersData.find(m => m.name === savedUserName);
        if (loggedUser && loggedUser.role === 'admin') {
            const foundUser = membersData.find(m => m.name === viewUserName);
            if (foundUser) {
                currentUser = foundUser;
                document.getElementById('login-container').classList.add('hidden');
                document.getElementById('dashboard-container').classList.remove('hidden');
                loadMemberDashboard(currentUser);
                return;
            }
        }
    }

    const savedUserName = localStorage.getItem('tenfc_logged_user');
    if (savedUserName) {
        const foundUser = membersData.find(m => m.name === savedUserName);
        if (foundUser && !foundUser.isWithdrawn) {
            currentUser = foundUser;
            document.getElementById('login-container').classList.add('hidden');
            if (currentUser.role === 'admin' || currentUser.role === 'sub_admin') {
                document.getElementById('admin-container').classList.remove('hidden');
                loadAdminDashboard();
            } else {
                document.getElementById('dashboard-container').classList.remove('hidden');
                loadMemberDashboard(currentUser);
            }
        } else {
            localStorage.removeItem('tenfc_logged_user');
        }
    }
}
initApp();

function changeSort(field) {
    currentSortOrder = (currentSortField === field && currentSortOrder === 'asc') ? 'desc' : 'asc';
    currentSortField = field;
    loadAdminDashboard();
}

function changeRestrictedSort(field) {
    restrictedSortOrder = (restrictedSortField === field && restrictedSortOrder === 'asc') ? 'desc' : 'asc';
    restrictedSortField = field;
    renderRestrictedMemberList();
}

function calculateInternationalAge(birthStr) {
    if (!birthStr) return "-";
    const parts = birthStr.split('.');
    if (parts.length < 3) return birthStr;
    const bYear = parseInt(parts[0], 10), bMonth = parseInt(parts[1], 10), bDay = parseInt(parts[2], 10);
    const today = new Date();
    let age = today.getFullYear() - bYear;
    const m = (today.getMonth() + 1) - bMonth;
    if (m < 0 || (m === 0 && today.getDate() < bDay)) age--;
    return `${birthStr} (만 ${age}세)`;
}

function formatShortBirthAge(birthStr) {
    if (!birthStr) return "-";
    const parts = birthStr.split(' ')[0].split('.');
    if (parts.length < 3) return birthStr;
    const bYear = parseInt(parts[0], 10), bMonth = parseInt(parts[1], 10), bDay = parseInt(parts[2], 10);
    const today = new Date();
    let age = today.getFullYear() - bYear;
    const m = (today.getMonth() + 1) - bMonth;
    if (m < 0 || (m === 0 && today.getDate() < bDay)) age--;
    return `${String(bYear).slice(-2)}년${bMonth}월 (만${age}세)`;
}

function openPhotoPreview(name) {
    const m = membersData.find(item => item.name === name);
    if (!m) return;
    document.getElementById('preview-member-name').innerText = `${m.name} 님 프로필 사진`;
    const imgEl = document.getElementById('preview-member-img'), fallbackEl = document.getElementById('preview-member-fallback');
    if (m.photo && m.photo.trim() !== "") {
        imgEl.src = m.photo; imgEl.classList.remove('hidden'); fallbackEl.classList.add('hidden');
    } else {
        imgEl.classList.add('hidden'); fallbackEl.classList.remove('hidden');
    }
    document.getElementById('photo-preview-modal').classList.remove('hidden');
}
function closePhotoPreview() { document.getElementById('photo-preview-modal').classList.add('hidden'); }

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const inputName = document.getElementById('name-input').value.trim();
    const inputPw = document.getElementById('phone-input').value.trim();
    const user = membersData.find(m => m.name === inputName && m.password === inputPw);

    if (user) {
        if (user.isWithdrawn) {
            document.getElementById('withdrawn-msg').innerText = `${user.name} 님은 현재 탈퇴 처리된 멤버입니다.`;
            document.getElementById('withdrawn-modal').classList.remove('hidden');
            return;
        }
        currentUser = user;
        localStorage.setItem('tenfc_logged_user', user.name);
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('login-error').classList.add('hidden');
        if (user.role === 'admin' || user.role === 'sub_admin') {
            document.getElementById('admin-container').classList.remove('hidden');
            loadAdminDashboard();
        } else {
            document.getElementById('dashboard-container').classList.remove('hidden');
            loadMemberDashboard(user);
        }
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
});

function closeWithdrawnModal() { document.getElementById('withdrawn-modal').classList.add('hidden'); }

function formatGroupText(memberList) {
    if (!memberList || memberList.length === 0) return "없음";
    return memberList.length > 1 ? `${memberList[0].name} 외 ${memberList.length - 1}명 (${memberList[0].attendedMatches}회)` : `${memberList[0].name} (${memberList[0].attendedMatches}회)`;
}

function loadMemberDashboard(user) {
    document.getElementById('user-welcome').innerHTML = `<span class="text-white">${user.name} 님</span>`;
    document.getElementById('team-total-matches-display').innerText = `${teamTotalMatches}회`;
    document.getElementById('member-total-count').innerText = `${activeRegularMemberCount}명`;
    
    const photoImg = document.getElementById('user-photo'), photoFallback = document.getElementById('user-photo-fallback');
    if (user.photo && user.photo.trim() !== "") {
        photoImg.src = user.photo; photoImg.classList.remove('hidden'); photoFallback.classList.add('hidden');
    } else {
        photoImg.classList.add('hidden'); photoFallback.classList.remove('hidden');
    }

    document.getElementById('prof-birth').innerText = calculateInternationalAge(user.birth);
    document.getElementById('prof-position').innerText = user.position;
    document.getElementById('prof-phone').innerText = user.fullPhone;
    document.getElementById('prof-kakao').innerText = user.kakaoId || "-";
    document.getElementById('prof-joindate').innerText = user.joinDate || "-";
    document.getElementById('prof-address').innerText = user.address || "-";
    document.getElementById('prof-role').innerText = user.role === 'admin' ? '주관리자' : (user.role === 'sub_admin' ? '부관리자' : '정회원');

    const isStaff = (user.role === 'admin' || user.role === 'sub_admin');
    const staffCard = document.getElementById('staff-stats-card');
    if (isStaff) {
        staffCard.classList.remove('hidden');
        document.getElementById('stat-captain').innerText = `${user.captainCount}회`;
        document.getElementById('stat-record').innerText = `${user.wins}승 ${user.draws}무 ${user.losses}패`;
        document.getElementById('stat-best-team').innerText = `${user.bestTeamCount}회`;
        document.getElementById('stat-goals').innerText = `${user.goalsFor}득 / ${user.goalsAgainst}실`;
    } else {
        staffCard.classList.add('hidden');
    }

    const attRate = teamTotalMatches > 0 ? Math.round((user.attendedMatches / teamTotalMatches) * 100) : 0;
    document.getElementById('stat-attendance').innerText = `${user.attendedMatches}회 / ${teamTotalMatches}회`;
    document.getElementById('stat-att-rate').innerText = `${attRate}%`;
    document.getElementById('user-feedback').innerText = user.feedback ? `"${user.feedback}"` : "등록된 피드백이 없습니다.";

    if (isStaff) {
        document.getElementById('admin-switch-bar').classList.remove('hidden');
        document.getElementById('admin-badge-text').innerText = user.role === 'admin' ? '🛡️ 주관리자 권한 보유 계정' : '👁️ 부관리자 권한 보유 계정';
    } else {
        document.getElementById('admin-switch-bar').classList.add('hidden');
    }

    const regularPool = membersData.filter(m => !m.isWithdrawn && (m.role === 'member' || m.role === 'admin' || m.role === 'sub_admin'));
    const isBlind = blindRatings.includes(user.rating);

    if (isBlind) {
        document.getElementById('stat-rating').innerText = "?";
        document.getElementById('stat-percentile').innerHTML = `? 등급<br><span class="text-xs text-slate-400">(조회 불가)</span>`;
        document.getElementById('blind-notice-box').classList.remove('hidden');
        document.getElementById('chart-card-container').classList.add('hidden');
    } else {
        document.getElementById('stat-rating').innerText = user.rating;
        const myScore = scoreMap[user.rating] || 6.0;
        let rank = regularPool.filter(m => (scoreMap[m.rating] || 0) > myScore).length + 1;
        const percentile = Math.round((rank / regularPool.length) * 100);
        document.getElementById('stat-percentile').innerHTML = `공동 ${rank}위<br><span class="text-xs text-slate-400">(상위 ${percentile}%)</span>`;
        document.getElementById('blind-notice-box').classList.add('hidden');
        document.getElementById('chart-card-container').classList.remove('hidden');
        renderChart(user.history || []);
    }

    const myAtt = user.attendedMatches;
    const attPool = membersData.filter(m => !m.isWithdrawn && m.role !== 'guest' && m.role !== 'acquaintance');
    document.getElementById('rank-above').innerText = formatGroupText(attPool.filter(m => m.attendedMatches > myAtt).sort((a,b)=>b.attendedMatches-a.attendedMatches));
    document.getElementById('rank-same').innerText = formatGroupText(attPool.filter(m => m.attendedMatches === myAtt && m.name !== user.name));
    document.getElementById('rank-below').innerText = formatGroupText(attPool.filter(m => m.attendedMatches < myAtt).sort((a,b)=>b.attendedMatches-a.attendedMatches));

    renderGradeCountChart(regularPool);
    renderRestrictedMemberList();
}

function renderRestrictedMemberList() {
    let list = membersData.filter(m => !m.isWithdrawn && m.role !== 'guest' && m.role !== 'acquaintance');
    list.sort((a, b) => {
        if (restrictedSortField === 'name') return restrictedSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        if (restrictedSortField === 'birth') return restrictedSortOrder === 'asc' ? (a.birth||"").localeCompare(b.birth||"") : (b.birth||"").localeCompare(a.birth||"");
        return restrictedSortOrder === 'asc' ? a.attendedMatches - b.attendedMatches : b.attendedMatches - a.attendedMatches;
    });
    document.getElementById('member-restricted-list').innerHTML = list.map(m => `
        <tr class="hover:bg-slate-700/35 transition">
            <td class="p-2.5 font-bold text-white flex items-center gap-2">
                <div onclick="openPhotoPreview('${m.name}')" class="w-7 h-7 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center cursor-pointer">
                    ${m.photo ? `<img src="${m.photo}" class="w-full h-full object-cover">` : '⚽'}
                </div>
                <span onclick="openPhotoPreview('${m.name}')" class="cursor-pointer hover:text-emerald-400">${m.name}</span>
            </td>
            <td class="p-2.5 text-slate-300">${formatShortBirthAge(m.birth)}</td>
            <td class="p-2.5 text-slate-300">${m.attendedMatches}회 / ${teamTotalMatches}회</td>
            <td class="p-2.5 text-amber-300">${m.kakaoId || '-'}</td>
        </tr>
    `).join('');
}

function switchToAdmin() { document.getElementById('dashboard-container').classList.add('hidden'); document.getElementById('admin-container').classList.remove('hidden'); loadAdminDashboard(); }
function switchToMyPage() { document.getElementById('admin-container').classList.add('hidden'); document.getElementById('dashboard-container').classList.remove('hidden'); loadMemberDashboard(currentUser); }

function loadAdminDashboard() {
    document.getElementById('admin-team-matches').innerText = `${teamTotalMatches}회`;
    document.getElementById('admin-member-total-count').innerText = `${activeRegularMemberCount}명`;
    renderMatchLogs();

    let list = [...membersData];
    list.sort((a, b) => {
        if (currentSortField === 'name') return currentSortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        if (currentSortField === 'birth') return currentSortOrder === 'asc' ? (a.birth||"").localeCompare(b.birth||"") : (b.birth||"").localeCompare(a.birth||"");
        if (currentSortField === 'rating') return currentSortOrder === 'asc' ? (scoreMap[b.rating]||0) - (scoreMap[a.rating]||0) : (scoreMap[a.rating]||0) - (scoreMap[b.rating]||0);
        return currentSortOrder === 'asc' ? a.attendedMatches - b.attendedMatches : b.attendedMatches - a.attendedMatches;
    });

    document.getElementById('admin-member-list').innerHTML = list.map(m => `
        <tr class="hover:bg-slate-700/35 transition ${m.isWithdrawn ? 'opacity-60 bg-rose-950/10' : ''}">
            <td class="p-3 text-center"><input type="checkbox" class="member-checkbox" value="${m.name}"></td>
            <td class="p-3 font-bold text-white flex items-center gap-2">
                <div class="w-7 h-7 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center">${m.photo ? `<img src="${m.photo}" class="w-full h-full object-cover">` : '⚽'}</div>
                ${m.name}
            </td>
            <td class="p-3 text-slate-300">${calculateInternationalAge(m.birth)}</td>
            <td class="p-3 text-slate-300">${m.position}</td>
            <td class="p-3 font-extrabold text-emerald-400">${m.rating}</td>
            <td class="p-3 text-slate-300">${m.attendedMatches}회</td>
            <td class="p-3 text-amber-300 text-[11px]">${m.wins}승${m.draws}무${m.losses}패 / 팀장${m.captainCount} / 우승${m.bestTeamCount}</td>
            <td class="p-3 text-center"><button onclick="openAdminEdit('${m.name}')" class="px-3 py-1 bg-emerald-600 text-white rounded text-xs">수정</button></td>
        </tr>
    `).join('');
}

function renderMatchLogs() {
    const tbody = document.getElementById('match-log-list');
    if (!matchLogsData || matchLogsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">등록된 경기 로그가 없습니다.</td></tr>`;
        return;
    }
    tbody.innerHTML = matchLogsData.map(log => `
        <tr class="hover:bg-slate-700/35 transition">
            <td class="p-2.5 font-bold text-emerald-400">${log.match_date}</td>
            <td class="p-2.5 text-slate-300 truncate max-w-xs">${log.lineup_summary}</td>
            <td class="p-2.5 text-amber-300 font-semibold">${log.result_summary}</td>
            <td class="p-2.5 text-sky-400">${log.best_team || '-'}</td>
            <td class="p-2.5 text-center"><button onclick="deleteMatchLog(${log.id})" class="px-2 py-1 bg-rose-800 text-white rounded text-[11px]">삭제</button></td>
        </tr>
    `).join('');
}

async function deleteMatchLog(id) {
    if (!confirm('로그를 삭제하시겠습니까?')) return;
    await supabaseClient.from('match_logs').delete().eq('id', id);
    await fetchMembersFromSupabase();
    loadAdminDashboard();
}

function openLineupModal() { document.getElementById('lineup-modal').classList.remove('hidden'); }
function closeLineupModal() { document.getElementById('lineup-modal').classList.add('hidden'); }

async function processLineupAttendance() {
    const rawText = document.getElementById('lineup-textarea').value;
    const resText = document.getElementById('match-results-input').value.trim();
    if (!rawText.trim()) { alert('라인업을 입력해주세요.'); return; }

    let tokens = rawText.split(/[\n,\/]+/);
    let targetMembers = [];
    tokens.forEach(token => {
        let clean = token.trim();
        if (!clean || clean.startsWith('⚽') || clean.includes('팀')) return;
        let pureName = clean.replace(/\([^)]*\)/g, '').replace(/[\*\-\s]/g, '');
        let found = membersData.find(m => !m.isWithdrawn && (m.name === clean || m.name === pureName));
        if (found && !targetMembers.some(i => i.id === found.id)) targetMembers.push(found);
    });

    if (targetMembers.length === 0) { alert('인식된 멤버가 없습니다.'); return; }
    if (!confirm(`총 ${targetMembers.length}명의 출석(+1)을 반영하시겠습니까?`)) return;

    for (let m of targetMembers) {
        await supabaseClient.from('test_members').update({ attended_matches: m.attendedMatches + 1 }).eq('name', m.name);
    }

    if (resText) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
        await supabaseClient.from('match_logs').insert([{ match_date: dateStr, lineup_summary: rawText.slice(0, 30) + '...', result_summary: resText, best_team: '통합' }]);
    }

    await fetchMembersFromSupabase();
    closeLineupModal();
    alert('반영 완료되었습니다!');
    loadAdminDashboard();
}

function openAddMemberModal() { document.getElementById('add-member-modal').classList.remove('hidden'); }
function closeAddMemberModal() { document.getElementById('add-member-modal').classList.add('hidden'); }

document.getElementById('add-member-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const rating = document.getElementById('add-rating').value.trim().toUpperCase() || "C";
    const newMember = {
        name: document.getElementById('add-name').value.trim(),
        password: document.getElementById('add-pw').value.trim(),
        full_phone: "010-XXXX-XXXX",
        position: document.getElementById('add-position').value.trim() || "멀티",
        rating: rating,
        join_date: "2026년",
        role: "member",
        is_withdrawn: false,
        attended_matches: 0,
        history: [{ date: "01.01", score: scoreMap[rating] || 6.5 }]
    };
    await supabaseClient.from('test_members').insert([newMember]);
    alert('등록 완료!');
    closeAddMemberModal();
    await fetchMembersFromSupabase();
    loadAdminDashboard();
});

function openSubAdminManageModal() {
    const container = document.getElementById('sub-admin-list-container');
    container.innerHTML = membersData.filter(m => m.role !== 'admin').map(m => `
        <div class="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-lg border border-slate-700 text-xs">
            <span class="font-bold text-white">${m.name}</span>
            <button onclick="toggleSubAdminRole('${m.name}', ${m.role !== 'sub_admin'})" class="px-2.5 py-1 ${m.role === 'sub_admin' ? 'bg-rose-800' : 'bg-emerald-600'} text-white rounded">${m.role === 'sub_admin' ? '해제' : '임명'}</button>
        </div>
    `).join('');
    document.getElementById('sub-admin-modal').classList.remove('hidden');
}
function closeSubAdminModal() { document.getElementById('sub-admin-modal').classList.add('hidden'); loadAdminDashboard(); }

async function toggleSubAdminRole(name, makeSub) {
    await supabaseClient.from('test_members').update({ role: makeSub ? 'sub_admin' : 'member' }).eq('name', name);
    await fetchMembersFromSupabase();
    openSubAdminManageModal();
}

function toggleSelectAll(master) { document.querySelectorAll('.member-checkbox').forEach(cb => cb.checked = master.checked); }
function exportMemberTextData() {
    let text = `== TenFC 멤버 명단 ==\n` + membersData.filter(m=>!m.isWithdrawn).map(m => `${m.name} / ${m.birth||'-'} / ${m.rating}`).join('\n');
    navigator.clipboard.writeText(text).then(() => alert('명단이 복사되었습니다!'));
}

async function batchAdjustRating(direction) {
    const boxes = document.querySelectorAll('.member-checkbox:checked');
    if (boxes.length === 0) { alert('선택된 멤버가 없습니다.'); return; }
    for (let cb of boxes) {
        const m = membersData.find(i => i.name === cb.value);
        if (m) {
            let idx = ratingHierarchy.indexOf(m.rating);
            if (direction === 'up' && idx < ratingHierarchy.length - 1) idx++;
            else if (direction === 'down' && idx > 0) idx--;
            const newRating = ratingHierarchy[idx];
            await supabaseClient.from('test_members').update({ rating: newRating, history: getUpdatedHistory(m.history, scoreMap[newRating]) }).eq('name', m.name);
        }
    }
    await fetchMembersFromSupabase();
    alert('일괄 조정 완료!');
    loadAdminDashboard();
}

async function applyBatchAttendance() {
    const boxes = document.querySelectorAll('.member-checkbox:checked');
    if (boxes.length === 0) { alert('선택된 멤버가 없습니다.'); return; }
    for (let cb of boxes) {
        const m = membersData.find(i => i.name === cb.value);
        if (m) await supabaseClient.from('test_members').update({ attended_matches: m.attendedMatches + 1 }).eq('name', m.name);
    }
    await fetchMembersFromSupabase();
    alert('출석 반영 완료!');
    loadAdminDashboard();
}

function openAdminEdit(name) {
    const m = membersData.find(i => i.name === name);
    if (!m) return;
    document.getElementById('edit-member-name').value = m.name;
    document.getElementById('edit-rating').value = m.rating;
    document.getElementById('edit-position').value = m.position;
    document.getElementById('edit-attended').value = m.attendedMatches;
    document.getElementById('admin-edit-modal').classList.remove('hidden');
}
function closeAdminModal() { document.getElementById('admin-edit-modal').classList.add('hidden'); }

document.getElementById('admin-edit-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('edit-member-name').value;
    const m = membersData.find(i => i.name === name);
    const newRating = document.getElementById('edit-rating').value.trim().toUpperCase();
    await supabaseClient.from('test_members').update({
        rating: newRating,
        position: document.getElementById('edit-position').value.trim(),
        attended_matches: parseInt(document.getElementById('edit-attended').value) || 0,
        history: getUpdatedHistory(m.history, scoreMap[newRating] || 6.5)
    }).eq('name', name);
    alert('수정 완료!');
    closeAdminModal();
    await fetchMembersFromSupabase();
    loadAdminDashboard();
});

function renderChart(history) {
    const ctx = document.getElementById('ratingChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.map(h => h.date),
            datasets: [{
                label: '평점 등급',
                data: history.map(h => h.score),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointRadius: 6,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    min: 1.0, max: 10.5, 
                    ticks: { 
                        color: '#94a3b8', stepSize: 0.5,
                        callback: function(value) {
                            const labels = {
                                10.0: "A+", 9.5: "A", 9.0: "A-",
                                8.5: "B+", 8.0: "B", 7.5: "B-",
                                7.0: "C+", 6.5: "C", 6.0: "C-",
                                5.5: "D+", 5.0: "D", 4.5: "D-",
                                4.0: "E+", 3.5: "E", 3.0: "E-",
                                2.5: "F+", 2.0: "F", 1.5: "F-"
                            };
                            return labels[value] || '';
                        }
                    }, 
                    grid: { color: '#334155' } 
                },
                x: { ticks: { color: '#94a38' }, grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const score = context.raw;
                            const revMap = Object.fromEntries(Object.entries(scoreMap).map(([k, v]) => [v, k]));
                            return ` 평점 등급: ${revMap[score] || score}`;
                        }
                    }
                }
            }
        }
    });
}

function renderGradeCountChart(regularPool) {
    const ctx = document.getElementById('gradeCountChart').getContext('2d');
    if (gradeCountChartInstance) gradeCountChartInstance.destroy();
    const counts = ratingHierarchy.map(grade => regularPool.filter(m => m.rating === grade).length);
    document.getElementById('grade-chart-total-label').innerText = `총 정회원: ${regularPool.length}명`;

    gradeCountChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ratingHierarchy,
            datasets: [{ label: '회원 수', data: counts, backgroundColor: '#38bdf8', borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: '#334155' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            },
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'top', color: '#e2e8f0', font: { size: 10, weight: 'bold' } } }
        },
        plugins: [ChartDataLabels]
    });
}

function openPwModal() { document.getElementById('pw-modal').classList.remove('hidden'); }
function closePwModal() { document.getElementById('pw-modal').classList.add('hidden'); document.getElementById('pw-form').reset(); }

document.getElementById('pw-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const currentPw = document.getElementById('current-pw').value.trim();
    const newPw = document.getElementById('new-pw').value.trim();
    const newPwConfirm = document.getElementById('new-pw-confirm').value.trim();

    if (currentPw !== currentUser.password) { alert('현재 비밀번호가 일치하지 않습니다.'); return; }
    if (newPw !== newPwConfirm) { alert('새 비밀번호가 서로 일치하지 않습니다.'); return; }

    await supabaseClient.from('test_members').update({ password: newPw }).eq('name', currentUser.name);
    currentUser.password = newPw;
    alert('비밀번호 변경 완료!');
    closePwModal();
});

function logout() {
    currentUser = null;
    localStorage.removeItem('tenfc_logged_user');
    document.getElementById('dashboard-container').classList.add('hidden');
    document.getElementById('admin-container').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('login-form').reset();
    document.getElementById('login-error').classList.add('hidden');
}
