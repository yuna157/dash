// ============================================
// OpenRouter API 설정
// ============================================
const OPENROUTER_API_KEY = "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";
const MODEL = "openai/gpt-4o-mini";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ============================================
// DOM 요소
// ============================================
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");

// ============================================
// 대화 기록 (컨텍스트 유지용)
// ============================================
let conversationHistory = [
    {
        role: "system",
        content: "당신은 친절하고 도움이 되는 AI 어시스턴트입니다. 한국어로 대화합니다. 웹 검색 결과가 제공되면 반드시 해당 정보를 기반으로 답변하세요. 확실하지 않은 정보는 추측하지 말고, 검색 결과를 인용하여 정확하게 답변해 주세요. 출처가 있다면 함께 알려주세요."
    }
];

// ============================================
// 메시지 추가 함수
// ============================================
function addMessage(role, content, isError = false) {
    // 환영 메시지 제거
    const welcome = chatMessages.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);

    const avatar = document.createElement("div");
    avatar.classList.add("message-avatar");
    avatar.textContent = role === "user" ? "👤" : "🤖";

    const contentDiv = document.createElement("div");
    contentDiv.classList.add("message-content");
    if (isError) contentDiv.classList.add("error-content");
    contentDiv.textContent = content;

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
    avatar.textContent = "🤖";

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

// ============================================
// 스크롤
// ============================================
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================
// OpenRouter API 호출
// ============================================
async function sendToOpenRouter(userMessage) {
    // 대화 기록에 사용자 메시지 추가
    conversationHistory.push({
        role: "user",
        content: userMessage
    });

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.href,
                "X-Title": "AI Chatbot"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: conversationHistory,
                max_tokens: 2048,
                temperature: 0.7,
                plugins: [
                    {
                        id: "web",
                        max_results: 5
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData?.error?.message || `HTTP ${response.status} 오류가 발생했습니다.`;
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const assistantMessage = data.choices?.[0]?.message?.content;

        if (!assistantMessage) {
            throw new Error("AI 응답을 받지 못했습니다.");
        }

        // 대화 기록에 AI 응답 추가
        conversationHistory.push({
            role: "assistant",
            content: assistantMessage
        });

        // 대화 기록이 너무 길어지면 오래된 것부터 제거 (시스템 메시지 유지)
        if (conversationHistory.length > 21) {
            conversationHistory = [
                conversationHistory[0],
                ...conversationHistory.slice(-20)
            ];
        }

        return { success: true, message: assistantMessage };

    } catch (error) {
        // 실패한 사용자 메시지는 기록에서 제거
        conversationHistory.pop();
        return { success: false, message: `오류: ${error.message}` };
    }
}

// ============================================
// 메시지 전송 처리
// ============================================
async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    // 사용자 메시지 표시
    addMessage("user", text);
    userInput.value = "";
    autoResizeTextarea();

    // UI 비활성화
    sendBtn.disabled = true;
    userInput.disabled = true;

    // 타이핑 인디케이터 표시
    showTypingIndicator();

    // API 호출
    const result = await sendToOpenRouter(text);

    // 타이핑 인디케이터 제거
    hideTypingIndicator();

    // 응답 표시
    if (result.success) {
        addMessage("bot", result.message);
    } else {
        addMessage("bot", result.message, true);
    }

    // UI 다시 활성화
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
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

// 폼 제출
chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSend();
});

// Enter로 전송 (Shift+Enter는 줄바꿈)
userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

// 텍스트영역 높이 자동 조절
userInput.addEventListener("input", autoResizeTextarea);

// 대화 초기화
clearBtn.addEventListener("click", () => {
    if (conversationHistory.length <= 1) return;

    conversationHistory = [conversationHistory[0]];

    chatMessages.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">💬</div>
            <h2>안녕하세요!</h2>
            <p>무엇이든 물어보세요. AI가 답변해 드립니다.</p>
        </div>
    `;
});
