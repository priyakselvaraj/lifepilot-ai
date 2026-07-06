// LifePilot AI — Frontend Client Logic

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const themeToggler = document.getElementById("theme-toggler");
  const themeToggleIcon = document.getElementById("theme-toggle-icon");
  const userGoalText = document.getElementById("user-goal-text");
  const btnGeneratePlan = document.getElementById("btn-generate-plan");
  const btnSeedExample = document.getElementById("btn-seed-example");
  
  const profileCard = document.getElementById("profile-card");
  const profileValuesContainer = document.getElementById("profile-values-container");
  
  const followUpCard = document.getElementById("follow-up-card");
  const followUpText = document.getElementById("follow-up-text");
  const btnUpdatePlan = document.getElementById("btn-update-plan");
  const btnClearState = document.getElementById("btn-clear-state");
  
  const planEmptyState = document.getElementById("plan-empty-state");
  const planGridContainer = document.getElementById("plan-grid-container");
  const planBodyCareer = document.getElementById("plan-body-career");
  const planBodyLearning = document.getElementById("plan-body-learning");
  const planBodyHabit = document.getElementById("plan-body-habit");
  const planBodyBudget = document.getElementById("plan-body-budget");
  const planBodySchedule = document.getElementById("plan-body-schedule");
  
  const guardianEmptyState = document.getElementById("guardian-empty-state");
  const guardianPanelContainer = document.getElementById("guardian-panel-container");
  const guardianStatusBadge = document.getElementById("guardian-status-badge");
  const guardianIssuesList = document.getElementById("guardian-issues-list");
  
  const btnRunEvals = document.getElementById("btn-run-evals");
  const evalsResultsContainer = document.getElementById("evals-results-container");
  const evalsEmptyState = document.getElementById("evals-empty-state");
  
  const loadingSpinner = document.getElementById("loading-spinner");
  const loadingTitle = document.getElementById("loading-title");
  const loadingDesc = document.getElementById("loading-desc");
  const btnCancelOperation = document.getElementById("btn-cancel-operation");

  // State
  let activeState = null;
  let activeAbortController = null;

  // Initialize
  initApp();

  function initApp() {
    // Force dark mode
    setTheme("dark");
    
    // Check existing state from server
    fetchState();
    
    // Wire up events
    themeToggler.addEventListener("click", toggleTheme);
    btnSeedExample.addEventListener("click", seedExample);
    btnGeneratePlan.addEventListener("click", generatePlan);
    btnUpdatePlan.addEventListener("click", updatePlan);
    btnClearState.addEventListener("click", clearState);
    btnRunEvals.addEventListener("click", runEvaluations);
    btnCancelOperation.addEventListener("click", () => {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
        hideLoading();
        showNotification("Operation cancelled by user.", "info");
      }
    });
    
    // Collapsible panels
    document.querySelectorAll(".plan-section-title").forEach(title => {
      title.addEventListener("click", () => {
        title.parentElement.classList.toggle("collapsed");
      });
    });
  }

  // Theme Toggler
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("color-scheme", theme);
    if (themeToggleIcon) {
      if (theme === "light") {
        themeToggleIcon.className = "fa-solid fa-moon";
      } else {
        themeToggleIcon.className = "fa-solid fa-sun";
      }
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }

  // Seed Example
  function seedExample() {
    userGoalText.value = "I'm changing jobs, want to learn GenAI, lose 10 pounds, and save $500 per month.";
    showNotification("Demo goal loaded! Click 'Launch LifePilot' to run the plan.", "info");
  }

  // Spinner Controls
  function showLoading(title, desc) {
    loadingTitle.textContent = title;
    loadingDesc.textContent = desc;
    loadingSpinner.classList.add("active");
  }

  function updateLoadingDesc(desc) {
    loadingDesc.textContent = desc;
  }

  function hideLoading() {
    loadingSpinner.classList.remove("active");
  }

  // Helper for NDJSON streaming progress
  async function fetchStream(endpoint, body, onStatus, onResult, onError) {
    try {
      activeAbortController = new AbortController();
      const options = {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : {},
        signal: activeAbortController.signal
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await fetch(endpoint, options);
      
      if (!response.ok) {
        let errText = "Server error.";
        try {
          const errData = await response.json();
          errText = errData.detail || errText;
        } catch (_) {}
        throw new Error(errText);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;
          
          try {
            const data = JSON.parse(cleanLine);
            if (data.error) {
              throw new Error(data.error);
            } else if (data.result) {
              onResult(data.result);
            } else if (data.status) {
              onStatus(data.status);
            }
          } catch (err) {
            onError(err);
            return;
          }
        }
      }
      
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          if (data.error) {
            throw new Error(data.error);
          } else if (data.result) {
            onResult(data.result);
          } else if (data.status) {
            onStatus(data.status);
          }
        } catch (err) {
          onError(err);
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        onError(e);
      }
    } finally {
      activeAbortController = null;
    }
  }

  // Notifications (Toast fallback helper)
  function showNotification(msg, type = "info") {
    console.log(`[LifePilot ${type}]`, msg);
    // Alert is simple and functional for user visibility
  }

  // API Call: Fetch active state
  async function fetchState() {
    try {
      const response = await fetch("/api/state");
      const data = await response.json();
      if (data && data.user_goal) {
        renderState(data);
      }
    } catch (e) {
      console.error("Error fetching state:", e);
    }
  }

  // API Call: Generate initial plan
  async function generatePlan() {
    const goal = userGoalText.value.trim();
    if (!goal) {
      alert("Please enter a goal first!");
      return;
    }

    showLoading("Launching LifePilot AI", "Supervisor is decomposing goal...");
    
    await fetchStream(
      "/api/generate",
      { goal },
      (status) => {
        updateLoadingDesc(status);
      },
      (state) => {
        renderState(state);
        showNotification("Unified plan generated successfully!", "success");
        switchTab("plan");
        hideLoading();
      },
      (error) => {
        hideLoading();
        alert("Generation failed: " + error.message);
      }
    );
  }

  // API Call: Update plan (follow up)
  async function updatePlan() {
    const followUp = followUpText.value.trim();
    if (!followUp) {
      alert("Please specify what adjustments you'd like to make!");
      return;
    }

    if (!activeState) {
      alert("No active plan to modify. Please generate a plan first.");
      return;
    }

    showLoading("Recalibrating Plan", "Supervisor is evaluating adjustments...");
    
    await fetchStream(
      "/api/generate",
      {
        goal: activeState.user_goal,
        follow_up: followUp
      },
      (status) => {
        updateLoadingDesc(status);
      },
      (state) => {
        renderState(state);
        followUpText.value = "";
        showNotification("Plan successfully updated!", "success");
        switchTab("plan");
        hideLoading();
      },
      (error) => {
        hideLoading();
        alert("Update failed: " + error.message);
      }
    );
  }

  // API Call: Clear saved state
  async function clearState() {
    if (!confirm("Are you sure you want to clear your current profile and plan? This cannot be undone.")) {
      return;
    }
    
    showLoading("Clearing State", "Resetting memory files...");
    try {
      await fetch("/api/clear", { method: "POST" });
      activeState = null;
      resetUI();
      showNotification("Saved plan cleared.", "info");
    } catch (e) {
      console.error(e);
    } finally {
      hideLoading();
    }
  }

  async function runEvaluations() {
    showLoading("Loading Quality Report", "Reading cached evaluation metrics...");
    evalsEmptyState.classList.add("hidden");
    evalsResultsContainer.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-spinner fa-spin"></i><h3>Loading Report...</h3><p>Fetching pre-computed evaluation results.</p></div>';
    
    try {
      const response = await fetch("/api/run-eval");
      if (!response.ok) {
        throw new Error("Failed to load evaluations report.");
      }
      const data = await response.json();
      renderEvaluations(data);
      showNotification("Quality report loaded successfully!", "info");
    } catch (error) {
      evalsResultsContainer.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-circle-exclamation" style="color:var(--accent-danger)"></i><h3>Failed to Load Report</h3><p>${error.message}</p></div>`;
    } finally {
      hideLoading();
    }
  }

  // Render Functions
  function renderState(state) {
    activeState = state;
    
    // Fill text inputs
    userGoalText.value = state.user_goal;
    
    // Render profile card
    renderProfile(state.profile);
    
    // Show cards
    profileCard.classList.remove("hidden");
    followUpCard.classList.remove("hidden");
    btnClearState.classList.remove("hidden");
    
    // Render plans
    renderPlans(state);
    
    // Render Guardian audit report
    renderGuardianReport(state.guardian_report);
  }

  function renderProfile(profile) {
    profileValuesContainer.innerHTML = "";
    if (!profile || Object.keys(profile).length === 0) {
      profileCard.classList.add("hidden");
      return;
    }
    
    for (const [key, val] of Object.entries(profile)) {
      const item = document.createElement("div");
      item.className = "profile-item";
      
      const label = key.replace(/_/g, " ");
      const labelCapitalized = label.charAt(0).toUpperCase() + label.slice(1);
      
      item.innerHTML = `
        <span class="profile-key">${labelCapitalized}</span>
        <span class="profile-val">${val}</span>
      `;
      profileValuesContainer.appendChild(item);
    }
  }

  function renderPlans(state) {
    const plans = state.current_plan;
    const subGoals = state.sub_goals || {};
    if (!plans) return;
    
    planEmptyState.classList.add("hidden");
    planGridContainer.classList.remove("hidden");
    
    // Toggle card visibility based on requested state
    const updateSectionVisibility = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const isRequestedKey = `${key}_requested`;
      const isRequested = subGoals[isRequestedKey] !== undefined ? subGoals[isRequestedKey] : true;
      if (isRequested && plans[key] && plans[key].trim()) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    };
    
    updateSectionVisibility("plan-section-career", "career");
    updateSectionVisibility("plan-section-learning", "learning");
    updateSectionVisibility("plan-section-habit", "habit");
    updateSectionVisibility("plan-section-budget", "budget");
    updateSectionVisibility("plan-section-schedule", "schedule");

    planBodyCareer.innerHTML = renderMarkdown(plans.career);
    planBodyLearning.innerHTML = renderMarkdown(plans.learning);
    planBodyHabit.innerHTML = renderMarkdown(plans.habit);
    planBodyBudget.innerHTML = renderMarkdown(plans.budget);
    
    // Strip JSON block from schedule text before rendering
    let scheduleText = plans.schedule || "";
    const jsonIndex = scheduleText.indexOf("```json");
    if (jsonIndex !== -1) {
      scheduleText = scheduleText.substring(0, jsonIndex).trim();
    }
    
    planBodySchedule.innerHTML = renderMarkdown(scheduleText);
  }

  function renderGuardianReport(report) {
    if (!report) {
      guardianEmptyState.classList.remove("hidden");
      guardianPanelContainer.classList.add("hidden");
      return;
    }
    
    guardianEmptyState.classList.add("hidden");
    guardianPanelContainer.classList.remove("hidden");
    
    const badge = guardianStatusBadge;
    if (report.passed) {
      badge.className = "guardian-badge pass";
      badge.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>PASSED AUDIT</span>';
    } else {
      badge.className = "guardian-badge fail";
      badge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i><span>FAILED AUDIT</span>';
    }
    
    guardianIssuesList.innerHTML = "";
    
    // Render failures
    const failures = report.failures || [];
    failures.forEach(f => {
      const item = document.createElement("div");
      item.className = "guardian-item failure";
      item.innerHTML = `
        <i class="fa-solid fa-circle-exclamation"></i>
        <div>
          <strong style="color:var(--accent-danger);">Safety violation:</strong> ${f}
        </div>
      `;
      guardianIssuesList.appendChild(item);
    });
    
    // Render notes
    const notes = report.notes || [];
    notes.forEach(n => {
      const item = document.createElement("div");
      item.className = "guardian-item note";
      item.innerHTML = `
        <i class="fa-solid fa-circle-info"></i>
        <div>
          <strong>Observation:</strong> ${n}
        </div>
      `;
      guardianIssuesList.appendChild(item);
    });
    
    if (failures.length === 0 && notes.length === 0) {
      const item = document.createElement("div");
      item.className = "guardian-item note";
      item.innerHTML = `
        <i class="fa-solid fa-shield-halved"></i>
        <div>
          No issues or safety warnings detected. The plan is fully compliant.
        </div>
      `;
      guardianIssuesList.appendChild(item);
    }
  }

  function renderEvaluations(results) {
    evalsResultsContainer.innerHTML = "";
    if (!results || results.length === 0) {
      evalsEmptyState.classList.remove("hidden");
      return;
    }
    
    results.forEach(res => {
      const card = document.createElement("div");
      const statusClass = res.passed ? "pass" : "fail";
      card.className = `eval-card ${statusClass}`;
      
      const badgeClass = res.passed ? "pass" : "fail";
      const badgeText = res.passed ? "PASS" : "FAIL";
      const icon = res.passed ? "fa-circle-check" : "fa-circle-xmark";
      const iconColor = res.passed ? "var(--accent-success)" : "var(--accent-danger)";
      
      card.innerHTML = `
        <div class="eval-card-header">
          <span class="eval-card-title">${res.name}</span>
          <span class="eval-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="eval-query">Query: "${res.query}"</div>
        <div class="eval-details">
          <i class="fa-solid ${icon}" style="color:${iconColor}; margin-right:0.35rem;"></i>
          ${res.details}
        </div>
      `;
      evalsResultsContainer.appendChild(card);
    });
  }

  function resetUI() {
    userGoalText.value = "";
    followUpText.value = "";
    
    profileCard.classList.add("hidden");
    followUpCard.classList.add("hidden");
    btnClearState.classList.add("hidden");
    
    planEmptyState.classList.remove("hidden");
    planGridContainer.classList.add("hidden");
    
    guardianEmptyState.classList.remove("hidden");
    guardianPanelContainer.classList.add("hidden");
  }

  // Simple Markdown Parser
  function renderMarkdown(md) {
    if (!md) return "";
    
    let html = md;
    
    // Escape HTML tags to prevent injections but preserve code structures
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Inline Code: `code`
    html = html.replace(/`(.*?)`/g, "<code>$1</code>");

    // Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    
    // Italics: *text* or _text_
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    
    // Headers
    html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");

    // Links: [text](url) - support optional angle brackets, backticks, entities and query parameters
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      let cleanUrl = url.trim();
      if (cleanUrl.startsWith("&lt;")) cleanUrl = cleanUrl.substring(4);
      else if (cleanUrl.startsWith("<")) cleanUrl = cleanUrl.substring(1);
      else if (cleanUrl.startsWith("`")) cleanUrl = cleanUrl.substring(1);
      else if (cleanUrl.startsWith("'")) cleanUrl = cleanUrl.substring(1);
      else if (cleanUrl.startsWith('"')) cleanUrl = cleanUrl.substring(1);
      
      if (cleanUrl.endsWith("&gt;")) cleanUrl = cleanUrl.substring(0, cleanUrl.length - 4);
      else if (cleanUrl.endsWith(">")) cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
      else if (cleanUrl.endsWith("`")) cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
      else if (cleanUrl.endsWith("'")) cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
      else if (cleanUrl.endsWith('"')) cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
      return `<a href="${cleanUrl.trim()}" target="_blank" rel="noopener noreferrer" class="plan-link">${text}</a>`;
    });
    
    // Plain URLs
    html = html.replace(/(?<!href=")(?<!">)(https?:\/\/[^\s"<>{}[\])`']+)/g, (match, url) => {
      let cleanUrl = url;
      let trailing = "";
      while (cleanUrl.length > 0 && [".", ",", ";", "?", "!", ")", "`", "'", '"'].includes(cleanUrl[cleanUrl.length - 1])) {
        trailing = cleanUrl[cleanUrl.length - 1] + trailing;
        cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
      }
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="plan-link">${cleanUrl}</a>` + trailing;
    });
    
    // Bullet points (convert list lines first)
    html = html.replace(/^\s*-\s+(.*?)$/gm, "<li>$1</li>");
    html = html.replace(/^\s*\*\s+(.*?)$/gm, "<li>$1</li>");
    
    // Convert lines with bullet items to lists (clunky but works for single list groups)
    // Wrap groups of <li> elements into <ul>
    html = html.replace(/(<li>.*?<\/li>)/gs, "<ul>$1</ul>");
    // Remove duplicate consecutive <ul> tags if any (from multiple lists)
    html = html.replace(/<\/ul>\s*<ul>/g, "");
    
    // Paragraphs (split by empty line, wrap non-HTML elements in p)
    const blocks = html.split(/\n\n+/);
    const parsedBlocks = blocks.map(block => {
      block = block.trim();
      if (!block) return "";
      
      // If it already starts with an HTML block tag, don't wrap in <p>
      if (block.startsWith("<h") || block.startsWith("<ul") || block.startsWith("<ol") || block.startsWith("<blockquote")) {
        return block;
      }
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    });
    
    return parsedBlocks.join("");
  }
});

// Tab Switcher (Global namespace)
window.switchTab = function(tabName) {
  // Update Buttons
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  document.getElementById(`tab-btn-${tabName}`).classList.add("active");
  
  // Update Content Panels
  document.querySelectorAll(".tab-content").forEach(panel => {
    panel.classList.remove("active");
  });
  document.getElementById(`tab-content-${tabName}`).classList.add("active");
};
