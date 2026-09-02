// ============================================
// API 설정
// ============================================
const OPENROUTER_API_KEY = "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";
const SEOUL_API_KEY = "63764e697079756e343855486c5a43";
const MODEL = "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SEOUL_API_BASE = "http://openAPI.seoul.go.kr:8088";

// ============================================
// DOM 요소
// ============================================
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const statusText = document.getElementById("statusText");

// ============================================
// 전역 데이터
// ============================================
let facilityData = []; // 전체 체육시설 데이터
let isDataLoaded = false;
let conversationHistory = [];

// ============================================
// 페이지 로드 시 데이터 가져오기
// ============================================
async function loadAllFacilityData() {
    statusText.textContent = "데이터 로딩 중...";

    try {
        // 먼저 총 건수 확인
        const countRes = await fetch(`${SEOUL_API_BASE}/${SEOUL_API_KEY}/json/ListPublicReservationSport/1/1/`);
        const countData = await countRes.json();
        const totalCount = countData.ListPublicReservationSport.list_total_count;

        // 1000건씩 나눠서 전체 데이터 가져오기
        const promises = [];
        for (let start = 1; start <= totalCount; start += 1000) {
            const end = Math.min(start + 999, totalCount);
            promises.push(
                fetch(`${SEOUL_API_BASE}/${SEOUL_API_KEY}/json/ListPublicReservationSport/${start}/${end}/`)
                    .then(res => res.json())
                    .then(data => data.ListPublicReservationSport.row || [])
            );
        }

        const results = await Promise.all(promises);
        facilityData = results.flat();
        isDataLoaded = true;

        statusText.textContent = `✅ ${facilityData.length}개 시설 데이터 로드 완료`;
        console.log(`체육시설 데이터 ${facilityData.length}건 로드 완료`);

    } catch (error) {
        console.error("데이터 로드 실패:", error);
        statusText.textContent = "⚠️ 데이터 로드 실패 - 새로고침 해주세요";
    }
}

// 페이지 로드 시 실행
loadAllFacilityData();

// ============================================
// 사용자 질문에서 검색 조건 추출 + 필터링
// ============================================
function searchFacilities(query) {
    if (!isDataLoaded || facilityData.length === 0) return [];

    const q = query.toLowerCase();

    // 지역명 매칭
    const areas = [
        "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구",
        "성북구", "강북구", "도봉구", "노원구", "은평구", "서대문구", "마포구",
        "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구",
        "서초구", "강남구", "송파구", "강동구"
    ];
    const matchedArea = areas.find(a => q.includes(a.replace("구", "")) || q.includes(a));

    // 시설 종류 매칭
    const facilityTypes = [
        "테니스장", "축구장", "풋살경기장", "풋살", "농구장", "배구장",
        "배드민턴장", "배드민턴", "야구장", "족구장", "골프장", "골프",
        "수영장", "수영", "탁구장", "탁구", "체육관", "다목적경기장",
        "다목적", "볼링장", "볼링", "스쿼시", "인라인", "게이트볼",
        "운동장", "헬스", "피트니스", "요가", "필라테스", "빙상장"
    ];
    const matchedTypes = facilityTypes.filter(t => q.includes(t.replace("장", "")) || q.includes(t));

    // 상태 매칭
    let statusFilter = null;
    if (q.includes("접수중") || q.includes("예약 가능") || q.includes("예약가능") || q.includes("신청 가능")) {
        statusFilter = "접수중";
    } else if (q.includes("마감") || q.includes("예약 불가") || q.includes("예약불가")) {
        statusFilter = "예약마감";
    }

    // 무료/유료 매칭
    let payFilter = null;
    if (q.includes("무료") || q.includes("공짜") || q.includes("돈 안")) {
        payFilter = "무료";
    } else if (q.includes("유료")) {
        payFilter = "유료";
    }

    // 필터링
    let results = facilityData.filter(item => {
        let match = true;

        if (matchedArea) {
            match = match && item.AREANM === matchedArea;
        }

        if (matchedTypes.length > 0) {
            match = match && matchedTypes.some(t =>
                item.MINCLASSNM.includes(t) ||
                item.SVCNM.toLowerCase().includes(t.toLowerCase())
            );
        }

        if (statusFilter) {
            match = match && item.SVCSTATNM === statusFilter;
        }

        if (payFilter) {
            match = match && item.PAYATNM === payFilter;
        }

        return match;
    });

    // 필터 조건이 아무것도 없으면 키워드 기반 검색
    if (!matchedArea && matchedTypes.length === 0 && !statusFilter && !payFilter) {
        const keywords = q.replace(/[을를이가에서의는은도]/g, " ").split(/\s+/).filter(w => w.length >= 2);
        if (keywords.length > 0) {
            results = facilityData.filter(item => {
                const text = `${item.SVCNM} ${item.MINCLASSNM} ${item.PLACENM} ${item.AREANM}`.toLowerCase();
                return keywords.some(kw => text.includes(kw));
            });
        }
    }

    return results.slice(0, 15); // 최대 15개
}

// ============================================
// 시설 데이터를 AI에게 전달할 텍스트로 변환
// ============================================
function facilitiesToText(facilities) {
    if (facilities.length === 0) return "검색 결과가 없습니다.";

    return facilities.map((f, i) => {
        return `[${i + 1}] ${f.SVCNM}
- 종류: ${f.MINCLASSNM}
- 장소: ${f.PLACENM} (${f.AREANM})
- 상태: ${f.SVCSTATNM}
- 요금: ${f.PAYATNM}
- 이용시간: ${f.V_MIN}~${f.V_MAX}
- 접수기간: ${f.RCPTBGNDT?.split(" ")[0]} ~ ${f.RCPTENDDT?.split(" ")[0]}
- 대상: ${f.USETGTINFO?.trim()}
- 전화: ${f.TELNO}
- 예약: ${f.SVCURL}`;
    }).join("\n\n");
}

// ============================================
// 메시지 추가 함수
// ============================================
function addMessage(role, content, isError = false, isHtml = false) {
    const welcome = chatMessages.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);

    const avatar = document.createElement("div");
    avatar.classList.add("message-avatar");
    avatar.textContent = role === "user" ? "👤" : "🏟️";

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");
    if (isError) contentDiv.classList.add("error-content");

    if (isHtml) {
        contentDiv.innerHTML = content;
    } else {
        contentDiv.textContent = content;
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();
    return messageDiv;
}

// ============================================
// 타이핑 인디케이터
// ============================================
function showTypingIndicator() {
    const welcome = chatMessages.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", "bot");
    messageDiv.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.classList.add("message-avatar");
    avatar.textContent = "🏟️";

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");

    const typing = document.createElement("div");
    typing.classList.add("typing-indicator");
    typing.innerHTML = "<span></span><span></span><span></span>";

    contentDiv.appendChild(typing);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================
// OpenRouter AI 호출
// ============================================
async function askAI(userMessage, facilityContext) {
    const systemPrompt = `당신은 서울시 체육시설 공공서비스 예약 안내 챗봇입니다.
사용자의 질문에 대해 아래 제공된 체육시설 데이터를 기반으로 친절하고 정확하게 답변하세요.

답변 규칙:
1. 제공된 데이터만을 기반으로 답변하세요. 데이터에 없는 정보를 지어내지 마세요.
2. 시설 정보를 안내할 때는 시설명, 장소, 지역, 상태, 요금, 이용시간을 포함해 주세요.
3. 예약 링크가 있으면 안내해 주세요.
4. 검색 결과가 없으면 솔직히 없다고 말하고, 다른 검색 조건을 제안해 주세요.
5. 한국어로 답변하세요.
6. 답변은 간결하면서도 필요한 정보는 빠짐없이 전달하세요.
7. 여러 시설이 있으면 목록 형태로 깔끔하게 정리하세요.`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-10),
        {
            role: "user",
            content: `사용자 질문: ${userMessage}\n\n[검색된 체육시설 데이터]\n${facilityContext}`
        }
    ];

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.href,
                "X-Title": "Seoul Sports Facility Chatbot"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: messages,
                max_tokens: 2048,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "응답을 받지 못했습니다.";

    } catch (error) {
        throw new Error(`AI 응답 오류: ${error.message}`);
    }
}

// ============================================
// 메시지 전송 처리
// ============================================
async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    if (!isDataLoaded) {
        addMessage("bot", "⏳ 체육시설 데이터를 아직 불러오는 중입니다. 잠시 후 다시 시도해 주세요.", true);
        return;
    }

    // 사용자 메시지 표시
    addMessage("user", text);
    userInput.value = "";
    autoResizeTextarea();

    // UI 비활성화
    sendBtn.disabled = true;
    userInput.disabled = true;

    // 타이핑 인디케이터
    showTypingIndicator();

    try {
        // 1. 시설 데이터 검색
        const facilities = searchFacilities(text);
        const facilityContext = facilitiesToText(facilities);

        // 2. AI에게 질문 + 데이터 전달
        const aiResponse = await askAI(text, facilityContext);

        // 대화 기록 저장
        conversationHistory.push(
            { role: "user", content: text },
            { role: "assistant", content: aiResponse }
        );

        // 대화 기록 제한
        if (conversationHistory.length > 20) {
            conversationHistory = conversationHistory.slice(-20);
        }

        hideTypingIndicator();
        addMessage("bot", aiResponse);

    } catch (error) {
        hideTypingIndicator();
        addMessage("bot", `오류가 발생했습니다: ${error.message}`, true);
    }

    // UI 활성화
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
}

// ============================================
// 예시 질문 클릭
// ============================================
function askExample(btn) {
    userInput.value = btn.textContent;
    handleSend();
}

// ============================================
// 텍스트영역 자동 높이 조절
// ============================================
function autoResizeTextarea() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
}

// ============================================
// 이벤트 리스너
// ============================================
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSend();
});

userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

userInput.addEventListener("input", autoResizeTextarea);

clearBtn.addEventListener("click", () => {
    conversationHistory = [];
    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">🏅</div>
            <h2>서울시 체육시설 예약 안내</h2>
            <p>서울시 공공 체육시설 예약 정보를 자연어로 질문해 보세요!</p>
            <div class="example-queries">
                <button class="example-btn" onclick="askExample(this)">강남구 테니스장 알려줘</button>
                <button class="example-btn" onclick="askExample(this)">무료로 이용할 수 있는 축구장</button>
                <button class="example-btn" onclick="askExample(this)">지금 접수중인 배드민턴장</button>
                <button class="example-btn" onclick="askExample(this)">마포구에 어떤 체육시설이 있어?</button>
            </div>
        </div>
    `;
});
