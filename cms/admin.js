"use strict";

const statusEl = document.getElementById("status");
const saveButton = document.getElementById("saveButton");
const sectionsEditor = document.getElementById("sectionsEditor");
const portfolioEditor = document.getElementById("portfolioEditor");
const fontPreset = document.getElementById("displayFontPreset");
const customFontStack = document.getElementById("displayCustomFontStack");
const fontSizeControl = document.getElementById("displayFontSizeControl");
const shaderSpeedControl = document.getElementById("shaderSpeedControl");
const shaderIntensityControl = document.getElementById("shaderIntensityControl");
const shaderMenuReactivityControl = document.getElementById("shaderMenuReactivityControl");
const shaderMouseReactivityControl = document.getElementById("shaderMouseReactivityControl");

let content = null;

function setStatus(message, mode = "") {
  statusEl.textContent = message;
  statusEl.className = mode ? `is-${mode}` : "";
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function slug(value) {
  const result = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return result || `section-${Date.now()}`;
}

function createElement(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue !== undefined) element.textContent = textValue;
  return element;
}

function field(labelText, value, onInput, type = "text") {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = type;
  input.value = text(value);
  input.addEventListener("input", () => onInput(input.value));
  label.append(labelText, input);
  return label;
}

function checkbox(labelText, value, onChange) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.addEventListener("change", () => onChange(input.checked));
  label.append(labelText, input);
  return label;
}

function selectField(labelText, value, choices, onChange) {
  const label = document.createElement("label");
  const select = document.createElement("select");
  choices.forEach((choice) => {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  label.append(labelText, select);
  return label;
}

function rangeField(labelText, value, min, max, step, onInput) {
  const wrap = createElement("label", "range-control");
  const header = createElement("div", "range-control-header");
  const name = createElement("span", "range-label", labelText);
  const output = document.createElement("output");
  const input = document.createElement("input");
  output.className = "range-value";
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  output.value = input.value;
  output.textContent = input.value;
  input.addEventListener("input", () => {
    output.value = input.value;
    output.textContent = input.value;
    onInput(Number(input.value));
  });
  header.append(name, output);
  wrap.append(header, input);
  return wrap;
}

function updateCustomFontVisibility() {
  const customWrap = document.getElementById("customFontWrap");
  if (customWrap) customWrap.hidden = fontPreset.value !== "custom";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file) {
  const dataUrl = await fileToDataUrl(file);
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, dataUrl })
  });
  const result = await response.json();
  if (!response.ok || !result.path) throw new Error(result.error || "Upload failed");
  return result.path;
}

function uploadField(labelText, target, key, accept) {
  const wrap = createElement("div", "upload-row");
  const pathInput = field(labelText, target[key], (value) => {
    target[key] = value;
  });
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = accept;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      setStatus(`Uploading ${file.name}...`);
      target[key] = await uploadFile(file);
      setStatus(`Uploaded ${file.name}`, "ok");
      renderPortfolio();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
  wrap.append(pathInput, fileInput);
  return wrap;
}

function normalizeContent(value) {
  const normalized = value && typeof value === "object" ? value : {};
  normalized.identity = normalized.identity || {};
  normalized.display = normalized.display || {};
  normalized.display.fontPreset = normalized.display.fontPreset || "geist";
  normalized.display.customFontStack = normalized.display.customFontStack || "";
  normalized.display.fontSize = Number.isFinite(Number(normalized.display.fontSize)) ? Number(normalized.display.fontSize) : 16;
  normalized.shader = normalized.shader || {};
  normalized.shader.speed = Number.isFinite(Number(normalized.shader.speed)) ? Number(normalized.shader.speed) : 1;
  normalized.shader.intensity = Number.isFinite(Number(normalized.shader.intensity)) ? Number(normalized.shader.intensity) : 1;
  normalized.shader.menuReactivity = Number.isFinite(Number(normalized.shader.menuReactivity)) ? Number(normalized.shader.menuReactivity) : 1;
  normalized.shader.mouseReactivity = Number.isFinite(Number(normalized.shader.mouseReactivity)) ? Number(normalized.shader.mouseReactivity) : 1;
  normalized.menuSections = Array.isArray(normalized.menuSections) ? normalized.menuSections : [];
  normalized.portfolio = normalized.portfolio || {};
  normalized.portfolio.items = Array.isArray(normalized.portfolio.items) ? normalized.portfolio.items : [];
  normalized.contact = normalized.contact || {};
  return normalized;
}

function bindFixedFields() {
  const bindings = [
    ["identityName", content.identity, "name"],
    ["identitySubtitle", content.identity, "subtitle"],
    ["identityDescription", content.identity, "description"],
    ["portfolioTitle", content.portfolio, "title"],
    ["contactTitle", content.contact, "title"],
    ["contactFormAction", content.contact, "formAction"],
    ["contactEmailLabel", content.contact, "emailLabel"],
    ["contactMessageLabel", content.contact, "messageLabel"],
    ["contactSubmitLabel", content.contact, "submitLabel"],
    ["contactSubmitMeta", content.contact, "submitMeta"]
  ];

  bindings.forEach(([id, target, key]) => {
    const input = document.getElementById(id);
    input.value = text(target[key]);
    input.oninput = () => {
      target[key] = input.value;
    };
  });

  fontPreset.value = text(content.display.fontPreset) || "geist";
  fontPreset.onchange = () => {
    content.display.fontPreset = fontPreset.value;
    updateCustomFontVisibility();
  };

  customFontStack.value = text(content.display.customFontStack);
  customFontStack.oninput = () => {
    content.display.customFontStack = customFontStack.value;
  };

  updateCustomFontVisibility();
}

function renderDisplay() {
  fontSizeControl.replaceChildren(rangeField("Base Font Size", content.display.fontSize, 12, 24, 1, (value) => {
    content.display.fontSize = value;
  }));
}

function renderShader() {
  shaderSpeedControl.replaceChildren(rangeField("Motion Speed", content.shader.speed, 0, 3, 0.05, (value) => {
    content.shader.speed = value;
  }));
  shaderIntensityControl.replaceChildren(rangeField("Visual Intensity", content.shader.intensity, 0.2, 2, 0.05, (value) => {
    content.shader.intensity = value;
  }));
  shaderMenuReactivityControl.replaceChildren(rangeField("Menu Reactivity", content.shader.menuReactivity, 0, 2, 0.05, (value) => {
    content.shader.menuReactivity = value;
  }));
  shaderMouseReactivityControl.replaceChildren(rangeField("Mouse Reactivity", content.shader.mouseReactivity, 0, 2, 0.05, (value) => {
    content.shader.mouseReactivity = value;
  }));
}

function createMenuItemEditor(item, section, index) {
  const row = createElement("div", "editor-item");
  const title = createElement("div", "item-title");
  title.append(createElement("h3", "", `Item ${index + 1}`));
  const remove = createElement("button", "danger", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => {
    section.items.splice(index, 1);
    renderSections();
  });
  title.append(remove);

  row.append(title);
  row.append(selectField("Type", item.type || "link", [
    { value: "link", label: "Link" },
    { value: "video", label: "Video" }
  ], (value) => {
    item.type = value;
    renderSections();
  }));
  row.append(field("Label", item.label, (value) => {
    item.label = value;
  }));
  row.append(field("Right Meta", item.meta, (value) => {
    item.meta = value;
  }));

  if (item.type === "video") {
    row.append(field("Video URL or YouTube ID", item.video, (value) => {
      item.video = value;
    }));
  } else {
    row.append(field("Href", item.href, (value) => {
      item.href = value;
    }));
    row.append(checkbox("Open in new tab", item.newTab !== false, (value) => {
      item.newTab = value;
    }));
  }

  return row;
}

function createSectionEditor(section, index) {
  section.items = Array.isArray(section.items) ? section.items : [];

  const block = createElement("div", "editor-item");
  const title = createElement("div", "item-title");
  title.append(createElement("h3", "", `Section ${index + 1}`));
  const remove = createElement("button", "danger", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => {
    content.menuSections.splice(index, 1);
    renderSections();
  });
  title.append(remove);

  block.append(title);
  block.append(field("Title", section.title, (value) => {
    section.title = value;
    section.id = slug(value);
  }));

  const items = createElement("div", "nested-list");
  section.items.forEach((item, itemIndex) => items.append(createMenuItemEditor(item, section, itemIndex)));
  const addItem = createElement("button", "compact", "Add Item");
  addItem.type = "button";
  addItem.addEventListener("click", () => {
    section.items.push({ type: "link", label: "New Item", meta: "", href: "", newTab: true });
    renderSections();
  });
  items.append(addItem);
  block.append(items);

  return block;
}

function renderSections() {
  sectionsEditor.replaceChildren();
  content.menuSections.forEach((section, index) => sectionsEditor.append(createSectionEditor(section, index)));
}

function createPortfolioEditor(item, index) {
  const block = createElement("div", "editor-item");
  const title = createElement("div", "item-title");
  title.append(createElement("h3", "", `Work ${index + 1}`));
  const remove = createElement("button", "danger", "Remove");
  remove.type = "button";
  remove.addEventListener("click", () => {
    content.portfolio.items.splice(index, 1);
    renderPortfolio();
  });
  title.append(remove);

  block.append(title);
  block.append(field("Title", item.title, (value) => {
    item.title = value;
  }));
  block.append(field("Year", item.year, (value) => {
    item.year = value;
  }));
  block.append(field("Type of Work", item.workType, (value) => {
    item.workType = value;
  }));
  block.append(uploadField("Image Path", item, "image", "image/*"));
  block.append(uploadField("Video Path / YouTube URL", item, "video", "video/*"));
  block.append(field("Project URL", item.url, (value) => {
    item.url = value;
  }));
  return block;
}

function renderPortfolio() {
  portfolioEditor.replaceChildren();
  content.portfolio.items.forEach((item, index) => portfolioEditor.append(createPortfolioEditor(item, index)));
}

function renderAll() {
  bindFixedFields();
  renderSections();
  renderPortfolio();
  renderDisplay();
  renderShader();
}

async function loadContent() {
  try {
    const response = await fetch("/api/content", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load content");
    content = normalizeContent(result);
    renderAll();
    setStatus("Content loaded", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function saveContent() {
  try {
    content.display.fontSize = Number(content.display.fontSize) || 16;
    content.shader.speed = Number(content.shader.speed) || 0;
    content.shader.intensity = Number(content.shader.intensity) || 1;
    content.shader.menuReactivity = Number(content.shader.menuReactivity) || 0;
    content.shader.mouseReactivity = Number(content.shader.mouseReactivity) || 0;
    content.menuSections.forEach((section) => {
      section.id = section.id || slug(section.title);
      section.items = Array.isArray(section.items) ? section.items : [];
    });
    const response = await fetch("/api/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Save failed");
    setStatus(`Saved ${result.path}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function setActiveTab(tabName) {
  document.querySelectorAll(".feature-tab").forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.id === `panel-${tabName}`;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

document.querySelectorAll(".feature-tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

document.getElementById("addSection").addEventListener("click", () => {
  content.menuSections.push({ id: "new-section", title: "New Section", items: [] });
  renderSections();
});

document.getElementById("addPortfolioItem").addEventListener("click", () => {
  content.portfolio.items.push({
    title: "New Work",
    year: "",
    workType: "",
    image: "",
    video: "",
    url: ""
  });
  renderPortfolio();
});

saveButton.addEventListener("click", saveContent);
loadContent();
