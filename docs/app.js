(function () {
  const params = new URLSearchParams(window.location.search);

  const state = {
    mode: params.get('mode') === 'prep' ? 'prep' : 'interview', // 'interview' | 'prep'
    showPendingFrames: true,
    focusedStoryId: params.get('story') || 'all',
    openMetaEditors: new Set(),
    content: null,
    filesOnDisk: {},
    activeUploadTarget: null
  };

  const els = {
    modeInterviewBtn: document.getElementById('mode-interview-btn'),
    modePrepBtn: document.getElementById('mode-prep-btn'),
    toggleEmptySlotsBtn: document.getElementById('toggle-empty-slots-btn'),
    prepGuideBanner: document.getElementById('prep-guide-banner'),
    priorityProgressText: document.getElementById('priority-progress-text'),
    priorityChecklistGrid: document.getElementById('priority-checklist-grid'),
    heroSection: document.getElementById('hero-section'),
    storiesStack: document.getElementById('stories-stack'),
    fileInput: document.getElementById('global-file-input'),
    lightbox: document.getElementById('photo-lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    lightboxCaption: document.getElementById('lightbox-caption'),
    lightboxCloseBtn: document.getElementById('lightbox-close-btn'),
    toast: document.getElementById('status-toast')
  };

  let toastTimer = null;
  function showToast(msg, duration = 3400) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, duration);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Base path of the app (works at / on the local server and at /haisu/ on GitHub Pages)
  const BASE = window.location.pathname.replace(/[^/]*$/, '');
  function rebase(obj) {
    if (typeof obj === 'string') return /^\/(media|data)\//.test(obj) ? BASE + obj.slice(1) : obj;
    if (Array.isArray(obj)) return obj.map(rebase);
    if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) obj[k] = rebase(obj[k]); }
    return obj;
  }
  state.staticMode = false;
  async function fetchSiteData() {
    let data = null;
    try {
      const res = await fetch(BASE + 'api/content');
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) data = await res.json();
    } catch (e) { /* no server (static hosting) */ }
    if (!data) {
      const res = await fetch(BASE + 'data/site-content.json?t=' + Date.now());
      if (!res.ok) throw new Error('Failed to load content');
      data = { content: await res.json(), filesOnDisk: {} };
      state.staticMode = true;
    }
    state.content = rebase(data.content);
    state.filesOnDisk = data.filesOnDisk || {};
    renderAll();
  }

  function getAllPrioritySlots() {
    if (!state.content) return [];
    const list = [];
    if (state.content.coverSlot) {
      list.push({ storyTitle: 'Cover', slot: state.content.coverSlot });
    }
    for (const story of state.content.stories || []) {
      for (const slot of story.mediaSlots || []) {
        if (slot.priority === 'priority-1') {
          list.push({ storyTitle: `${story.number} ${story.titleEn}`, slot });
        }
      }
    }
    return list;
  }

  function renderToolbarState() {
    els.modeInterviewBtn.classList.toggle('active', state.mode === 'interview');
    els.modePrepBtn.classList.toggle('active', state.mode === 'prep');

    if (state.mode === 'prep') {
      els.toggleEmptySlotsBtn.hidden = true;
      els.prepGuideBanner.hidden = false;
    } else {
      els.toggleEmptySlotsBtn.hidden = false;
      els.prepGuideBanner.hidden = true;
      els.toggleEmptySlotsBtn.classList.toggle('active', !state.showPendingFrames);
      els.toggleEmptySlotsBtn.textContent = state.showPendingFrames
        ? 'Pending Frames: Shown'
        : 'Text-Only Clean View';
    }
  }

  function renderPrepBanner() {
    if (state.mode !== 'prep' || !state.content) return;
    const priorityItems = getAllPrioritySlots();
    const readyCount = priorityItems.filter((item) => Boolean(item.slot.src)).length;
    els.priorityProgressText.textContent = `${readyCount} / ${priorityItems.length} priority media ready`;

    els.priorityChecklistGrid.innerHTML = priorityItems
      .map(({ storyTitle, slot }) => {
        const done = Boolean(slot.src);
        return `
          <div class="priority-chip ${done ? 'done' : ''}">
            <span>${done ? '✓' : '○'}</span>
            <div>
              <strong>${escapeHtml(storyTitle)}</strong><br/>
              <span>${escapeHtml(slot.labelEn)}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderHero() {
    const { meta, coverSlot, stories } = state.content;
    const showCoverCard = Boolean(coverSlot.src) || state.mode === 'prep' || state.showPendingFrames;
    els.heroSection.className = `hero-section ${showCoverCard ? '' : 'text-only-hero'}`;

    const introVideoButtonHtml = meta.introVideoUrl
      ? `<a href="${escapeHtml(meta.introVideoUrl)}" class="chapter-pill" target="_blank" rel="noopener">▶ Watch 60s Intro</a>`
      : '';

    const chapterPillsHtml = [
      `<button type="button" class="chapter-pill ${state.focusedStoryId === 'all' ? 'active' : ''}" data-story-jump="all" id="jump-all-stories">
        All Stories
      </button>`,
      ...(stories || []).map(
        (s) => `
        <button type="button" class="chapter-pill ${state.focusedStoryId === s.id ? 'active' : ''}" data-story-jump="${escapeHtml(s.id)}" id="jump-story-${escapeHtml(s.id)}">
          <span class="chapter-pill-num">${escapeHtml(s.number)}</span>
          <span>${escapeHtml(s.titleEn)}</span>
        </button>
      `
      ),
      introVideoButtonHtml
    ].join('');

    els.heroSection.innerHTML = `
      <div class="hero-copy-col">
        <div class="eyebrow-bar">
          <span class="eyebrow-accent" aria-hidden="true"></span>
          <span class="eyebrow-label">${escapeHtml(meta.eyebrow)}</span>
        </div>
        <h1 class="hero-title">
          ${escapeHtml(meta.titleEn)}
        </h1>
        <p class="hero-subtitle">${escapeHtml(meta.subtitleEn)}</p>

        <div class="chapter-jump-bar">
          <span class="chapter-jump-caption">
            ${escapeHtml(meta.interviewTipEn)}
          </span>
          <div class="chapter-pills">
            ${chapterPillsHtml}
          </div>
        </div>

        <div class="hero-play-row">
          ${(stories || []).map((s) => {
            const n = (s.mediaSlots || []).filter((m) => m.src).length;
            return `<button type="button" class="play-reel-btn ${n ? '' : 'disabled'}" data-play-reel="${escapeHtml(s.id)}" id="play-reel-${escapeHtml(s.id)}">▶ Play ${escapeHtml(s.number)} full screen${n ? '' : ' (no media yet)'}</button>`;
          }).join('')}
        </div>
      </div>
      ${showCoverCard ? `<div class="hero-media-col">${renderMediaSlotCard(coverSlot, true)}</div>` : ''}
    `;
  }

  function renderMediaSlotCard(slot, isHero = false) {
    const hasMedia = Boolean(slot.src);
    const isPrep = state.mode === 'prep';
    const notes = slot.notes || {};
    const titleText = slot.labelEn;
    const hintText = slot.promptHintEn;
    const isMetaOpen = state.openMetaEditors.has(slot.id);

    let stageContent = '';
    if (hasMedia) {
      if (slot.type === 'live') {
        const posterAttr = slot.poster ? `poster="${escapeHtml(slot.poster)}"` : '';
        stageContent = `
          <div class="media-stage live-stage" data-live-toggle="${escapeHtml(slot.id)}" title="Tap to play with sound">
            <video muted autoplay loop playsinline preload="metadata" ${posterAttr} data-slot-video="${escapeHtml(slot.id)}" data-live="true">
              <source src="${escapeHtml(slot.src)}" type="video/mp4" />
            </video>
            <span class="live-badge" aria-hidden="true">LIVE</span>
          </div>
        `;
      } else if (slot.type === 'video') {
        const posterAttr = slot.poster ? `poster="${escapeHtml(slot.poster)}"` : '';
        const trackHtml = slot.subtitlesVtt
          ? `<track kind="subtitles" srclang="en" label="English" src="${escapeHtml(slot.subtitlesVtt)}" default />`
          : '';
        stageContent = `
          <div class="media-stage">
            <video controls preload="${isHero ? 'metadata' : 'none'}" playsinline ${posterAttr} data-slot-video="${escapeHtml(slot.id)}">
              <source src="${escapeHtml(slot.src)}" />
              ${trackHtml}
              Your browser does not support HTML5 video.
            </video>
          </div>
        `;
      } else {
        const captionForZoom = notes.whatHappened || titleText;
        stageContent = `
          <div class="media-stage">
            <img
              src="${escapeHtml(slot.src)}"
              alt="${escapeHtml(notes.whatHappened || slot.labelEn)}"
              loading="${isHero ? 'eager' : 'lazy'}"
              data-zoom-src="${escapeHtml(slot.src)}"
              data-zoom-caption="${escapeHtml(captionForZoom)}"
            />
          </div>
        `;
      }
    } else {
      const badgeLabel = slot.priority === 'priority-1'
        ? 'Priority Media · To be added'
        : 'Optional Media';
      stageContent = `
        <div class="media-empty-slot clickable-dropzone" data-upload-trigger="${escapeHtml(slot.id)}" data-folder="${escapeHtml(slot.folder)}" role="button" tabindex="0" aria-label="Upload media for ${escapeHtml(slot.labelEn)}">
          <div class="slot-badge-row">
            <span>${slot.type === 'video' ? '🎬 Video Slot' : '📷 Photo Slot'}</span>
            <span>·</span>
            <span>${escapeHtml(badgeLabel)}</span>
          </div>
          <p class="slot-empty-title">${escapeHtml(titleText)}</p>
          <p class="slot-empty-hint">${escapeHtml(hintText)}</p>
          <span class="slot-path-code">Drop file here or click to upload → docs/media/${escapeHtml(slot.folder)}/</span>
        </div>
      `;
    }

    // Caption bar for uploaded media (or when notes exist)
    const hasNotesToShow = hasMedia || notes.whatHappened || notes.context || notes.quoteAndTimestamp;
    const captionHtml = hasNotesToShow
      ? `
        <div class="media-caption-bar">
          <div class="media-caption-title">
            <span>${escapeHtml(notes.whatHappened || titleText)}</span>
            ${notes.context ? `<span class="slot-path-code">${escapeHtml(notes.context)}</span>` : ''}
          </div>
          ${notes.usageNotes && isPrep ? `<div class="media-caption-note">Notes: ${escapeHtml(notes.usageNotes)}</div>` : ''}
          ${notes.quoteAndTimestamp ? `<div class="media-quote-pill">${escapeHtml(notes.quoteAndTimestamp)}</div>` : ''}
        </div>
      `
      : '';

    // Prep mode action bar & 5-item metadata form
    const prepControlsHtml = isPrep
      ? `
        <div class="slot-prep-actions">
          <button type="button" class="btn-small primary" data-upload-trigger="${escapeHtml(slot.id)}" data-folder="${escapeHtml(slot.folder)}">
            ${hasMedia ? 'Replace Photo/Video' : '+ Upload Photo/Video'}
          </button>
          <div style="display:flex; gap:0.4rem;">
            <button type="button" class="btn-small" data-toggle-meta="${escapeHtml(slot.id)}">
              ${isMetaOpen ? 'Hide Notes' : 'Edit Notes'}
            </button>
            ${hasMedia ? `<button type="button" class="btn-small" data-clear-slot="${escapeHtml(slot.id)}" title="Remove media from this slot">Clear</button>` : ''}
          </div>
        </div>
        ${
          isMetaOpen
            ? `
          <form class="slot-meta-editor" data-meta-form="${escapeHtml(slot.id)}">
            <div class="meta-field">
              <label>1. Filename (in docs/media/${escapeHtml(slot.folder)}/)</label>
              <input type="text" name="filename" value="${escapeHtml(notes.filename || '')}" placeholder="e.g. ${escapeHtml(slot.folder)}-01.${slot.type === 'video' ? 'mp4' : 'jpg'}" />
            </div>
            <div class="meta-field">
              <label>2. Context (when &amp; where)</label>
              <input type="text" name="context" value="${escapeHtml(notes.context || '')}" placeholder="When and where this happened" />
            </div>
            <div class="meta-field">
              <label>3. What happened (concrete action, not a trait)</label>
              <input type="text" name="whatHappened" value="${escapeHtml(notes.whatHappened || '')}" placeholder="Describe the specific action in the frame" />
            </div>
            <div class="meta-field">
              <label>4. Quote &amp; timestamp (optional)</label>
              <input type="text" name="quoteAndTimestamp" value="${escapeHtml(notes.quoteAndTimestamp || '')}" placeholder="e.g. 00:08 hands out a straw, or his exact words" />
            </div>
            <div class="meta-field">
              <label>5. Usage notes (cover candidate, cropping, privacy)</label>
              <input type="text" name="usageNotes" value="${escapeHtml(notes.usageNotes || '')}" placeholder="Cover suggestion / crop or privacy notes" />
            </div>
            ${
              slot.type === 'video'
                ? `
              <div class="meta-field">
                <label>6. English subtitles (WebVTT, optional)</label>
                <textarea name="subtitlesText" placeholder="00:00.000 --> 00:05.000&#10;Mom, chant the headband spell!">${escapeHtml(slot.subtitlesRaw || '')}</textarea>
              </div>
            `
                : ''
            }
            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
              <button type="submit" class="btn-small primary">Save Notes</button>
            </div>
          </form>
        `
            : ''
        }
      `
      : '';

    return `
      <div class="media-frame" id="slot-card-${escapeHtml(slot.id)}" data-drop-slot="${escapeHtml(slot.id)}" data-drop-folder="${escapeHtml(slot.folder)}">
        ${stageContent}
        ${captionHtml}
        ${prepControlsHtml}
      </div>
    `;
  }

  function renderStories() {
    const stories = state.content.stories || [];
    const isPrep = state.mode === 'prep';

    const filteredStories = state.focusedStoryId === 'all'
      ? stories
      : stories.filter((s) => s.id === state.focusedStoryId);

    els.storiesStack.innerHTML = filteredStories
      .map((story) => {
        // Filter media slots depending on mode and showPendingFrames
        const visibleSlots = (story.mediaSlots || []).filter((slot) => {
          if (Boolean(slot.src)) return true;
          if (isPrep) return true;
          if (!state.showPendingFrames) return false;
          // In interview mode with showPendingFrames ON, show priority-1 slots and hide optional empty slots to keep layout clean
          return slot.priority === 'priority-1';
        });

        const primarySlot = visibleSlots[0] || null;
        const secondarySlots = visibleSlots.slice(1);
        // Filmstrip layout: when a story has 4+ clips/photos, lay them out as a horizontal strip under the prose
        const useFilmstrip = visibleSlots.length >= 4;
        const hasMediaCol = visibleSlots.length > 0 && !useFilmstrip;
        const filmstripHtml = useFilmstrip
          ? `
            <div class="filmstrip">
              <span class="journey-strip-label">Moments from the stand · tap a clip for sound</span>
              <div class="filmstrip-track">
                ${visibleSlots.map((slot) => renderMediaSlotCard(slot, false)).join('')}
              </div>
            </div>
          `
          : '';

        // Paragraphs
        const paragraphsHtml = (story.bodyEn || [])
          .map((pEn) => {
            return `
              <div class="story-para-pair">
                <p class="story-paragraph-en">${escapeHtml(pEn)}</p>
              </div>
            `;
          })
          .join('');

        // Verbatim Quote Card
        const quoteHtml = story.quote
          ? `
            <div class="verbatim-card">
              <div class="verbatim-card-top">
                <span class="verbatim-badge">Haisu’s Words</span>
              </div>
                            <p class="verbatim-zh">${escapeHtml(story.quote.en)}</p>
              <p class="verbatim-attr">
                — ${escapeHtml(story.quote.attributionEn)}
              </p>
            </div>
          `
          : '';

        // Cultural Note (for Monkey King)
        const culturalNoteHtml = story.culturalNoteEn
          ? `
            <div class="cultural-footnote">
              <strong>Context for Teachers:</strong> ${escapeHtml(story.culturalNoteEn)}
            </div>
          `
          : '';

        // Confirmed Pending Checks (if filled in, display subtly; in Prep Mode show editable inputs)
        const filledChecks = (story.pendingChecks || []).filter((c) => c.value && c.value.trim());
        const filledChecksDisplayHtml = !isPrep && filledChecks.length > 0
          ? `
            <div class="cultural-footnote">
              ${filledChecks.map((c) => `<div>• ${escapeHtml(c.value)}</div>`).join('')}
            </div>
          `
          : '';

        const prepChecksHtml = isPrep && story.pendingChecks && story.pendingChecks.length > 0
          ? `
            <div class="pending-checks-box">
              <p class="pending-checks-title">Details to Confirm</p>
              ${story.pendingChecks
                .map(
                  (chk) => `
                  <div class="pending-check-item">
                    <label class="pending-check-label">${escapeHtml(chk.labelEn)}</label>
                    <div class="pending-input-row">
                      <input
                        type="text"
                        class="pending-input"
                        data-pending-input="${escapeHtml(story.id)}:${escapeHtml(chk.id)}"
                        value="${escapeHtml(chk.value || '')}"
                        placeholder="Add the confirmed detail here..."
                      />
                      <button
                        type="button"
                        class="btn-small primary"
                        data-save-pending="${escapeHtml(story.id)}"
                        data-check-id="${escapeHtml(chk.id)}"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                `
                )
                .join('')}
            </div>
          `
          : '';

        // Story 02 Bespoke 5-Step Journey Strip
        const journeyStripHtml = story.journeySteps
          ? `
            <div class="journey-strip">
              <span class="journey-strip-label">Story Arc</span>
              <div class="journey-steps-grid">
                ${story.journeySteps
                  .map(
                    (st) => `
                    <div class="journey-step-card">
                      <span class="journey-step-num">STEP ${escapeHtml(st.step)}</span>
                      <p class="journey-step-title">
                        ${escapeHtml(st.titleEn)}
                      </p>
                      <p class="journey-step-detail">
                        ${escapeHtml(st.detailEn)}
                      </p>
                    </div>
                  `
                  )
                  .join('')}
              </div>
            </div>
          `
          : '';

        return `
          <article class="story-section" id="story-${escapeHtml(story.id)}" data-theme="${escapeHtml(story.theme || 'terracotta')}">
            <header class="story-header">
              <div class="story-title-group">
                <div class="story-index-tag">
                  <span>STORY ${escapeHtml(story.number)} / ${String(stories.length).padStart(2, '0')}</span>
                </div>
                <h2 class="story-title">
                  ${escapeHtml(story.titleEn)}
                </h2>
                <p class="story-summary-tagline">
                  ${escapeHtml(story.summaryEn)}
                </p>
              </div>
              ${visibleSlots.some((m) => m.src) ? `<button type="button" class="play-reel-btn" data-play-reel="${escapeHtml(story.id)}">▶ Play full screen</button>` : ''}
            </header>

            <div class="story-spread ${hasMediaCol ? '' : 'single-col'}">
              <div class="story-prose">
                ${paragraphsHtml}
                ${quoteHtml}
                ${culturalNoteHtml}
                ${filledChecksDisplayHtml}
                ${prepChecksHtml}
              </div>

              ${
                hasMediaCol
                  ? `
                <div class="story-media-stack">
                  ${primarySlot ? renderMediaSlotCard(primarySlot, false) : ''}
                  ${
                    secondarySlots.length > 0
                      ? `<div class="media-grid-secondary">
                          ${secondarySlots.map((slot) => renderMediaSlotCard(slot, false)).join('')}
                        </div>`
                      : ''
                  }
                </div>
              `
                  : ''
              }
            </div>

            ${filmstripHtml}
            ${journeyStripHtml}
          </article>
        `;
      })
      .join('');
  }

  function renderAll() {
    if (!state.content) return;
    renderToolbarState();
    renderPrepBanner();
    renderHero();
    renderStories();
    bindDynamicEvents();
  }

  async function uploadFileToSlot(file, slotId, folder) {
    if (!file) return;
    showToast(`Uploading "${file.name}" & preparing preview...`, 12000);
    try {
      const qs = new URLSearchParams({
        slotId,
        folder,
        filename: file.name
      });
      const res = await fetch(`/api/upload?${qs.toString()}`, {
        method: 'POST',
        body: file
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      state.content = data.content;
      state.filesOnDisk = data.filesOnDisk || {};
      state.openMetaEditors.add(slotId);
      renderAll();
      showToast(`✓ Saved "${data.savedAs}" to docs/media/${folder}/!`);
    } catch (err) {
      showToast(`Upload error: ${err.message}`, 5000);
    }
  }

  function bindDynamicEvents() {
    // Story jump pills
    document.querySelectorAll('[data-story-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-story-jump');
        if (targetId === 'all') {
          state.focusedStoryId = 'all';
          renderAll();
        } else {
          // If already focused on this story, clicking again returns to all stories; otherwise scrolls or filters
          if (state.focusedStoryId === targetId) {
            state.focusedStoryId = 'all';
            renderAll();
          } else {
            state.focusedStoryId = 'all';
            renderAll();
            const el = document.getElementById(`story-${targetId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      });
    });

    // Click-to-upload triggers
    document.querySelectorAll('[data-upload-trigger]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = el.getAttribute('data-upload-trigger');
        const folder = el.getAttribute('data-folder');
        state.activeUploadTarget = { slotId, folder };
        els.fileInput.value = '';
        els.fileInput.click();
      });
    });

    // Drag-and-drop on every media frame
    document.querySelectorAll('[data-drop-slot]').forEach((frame) => {
      const slotId = frame.getAttribute('data-drop-slot');
      const folder = frame.getAttribute('data-drop-folder');

      frame.addEventListener('dragover', (e) => {
        e.preventDefault();
        frame.classList.add('drag-over');
      });

      frame.addEventListener('dragleave', () => {
        frame.classList.remove('drag-over');
      });

      frame.addEventListener('drop', (e) => {
        e.preventDefault();
        frame.classList.remove('drag-over');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
          uploadFileToSlot(file, slotId, folder);
        }
      });
    });

    // Toggle 5-item metadata editor
    document.querySelectorAll('[data-toggle-meta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slotId = btn.getAttribute('data-toggle-meta');
        if (state.openMetaEditors.has(slotId)) {
          state.openMetaEditors.delete(slotId);
        } else {
          state.openMetaEditors.add(slotId);
        }
        renderAll();
      });
    });

    // Clear media slot
    document.querySelectorAll('[data-clear-slot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.getAttribute('data-clear-slot');
        const res = await fetch('/api/slot-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotId, src: '', poster: '' })
        });
        const data = await res.json();
        if (data.ok) {
          state.content = data.content;
          renderAll();
          showToast('Cleared slot preview (original file preserved in docs/media/)');
        }
      });
    });

    // Save 5-item metadata form
    document.querySelectorAll('[data-meta-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const slotId = form.getAttribute('data-meta-form');
        const formData = new FormData(form);
        const notes = {
          filename: formData.get('filename') || '',
          context: formData.get('context') || '',
          whatHappened: formData.get('whatHappened') || '',
          quoteAndTimestamp: formData.get('quoteAndTimestamp') || '',
          usageNotes: formData.get('usageNotes') || ''
        };
        const subtitlesText = formData.get('subtitlesText');
        const payload = { slotId, notes };
        if (subtitlesText !== null) {
          payload.subtitlesText = String(subtitlesText);
        }
        const res = await fetch('/api/slot-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          state.content = data.content;
          renderAll();
          showToast('✓ Saved media notes & synced to content-notes.md');
        }
      });
    });

    // Save pending check items
    document.querySelectorAll('[data-save-pending]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const storyId = btn.getAttribute('data-save-pending');
        const checkId = btn.getAttribute('data-check-id');
        const input = document.querySelector(`[data-pending-input="${storyId}:${checkId}"]`);
        const value = input ? input.value : '';
        const res = await fetch('/api/content-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId, pendingCheckId: checkId, value })
        });
        const data = await res.json();
        if (data.ok) {
          state.content = data.content;
          renderAll();
          showToast('✓ Updated note in content-notes.md');
        }
      });
    });

    // Photo zoom lightbox
    document.querySelectorAll('[data-zoom-src]').forEach((img) => {
      img.addEventListener('click', () => {
        const src = img.getAttribute('data-zoom-src');
        const caption = img.getAttribute('data-zoom-caption') || '';
        els.lightboxImg.src = src;
        els.lightboxImg.alt = caption;
        els.lightboxCaption.textContent = caption;
        els.lightbox.hidden = false;
      });
    });

    // Pause other videos when one starts playing (ignore silent looping live clips)
    const allVideos = document.querySelectorAll('video[data-slot-video]:not([data-live])');
    allVideos.forEach((vid) => {
      vid.addEventListener('play', () => {
        allVideos.forEach((other) => {
          if (other !== vid && !other.paused) {
            other.pause();
          }
        });
      });
    });

    // Live clips: tap to toggle sound (and restart from the beginning)
    document.querySelectorAll('[data-live-toggle]').forEach((stage) => {
      const vid = stage.querySelector('video');
      if (!vid) return;
      stage.addEventListener('click', (e) => {
        if (state.mode === 'prep') return; // in prep mode, clicks are for upload/drop
        e.stopPropagation();
        document.querySelectorAll('video[data-live]').forEach((other) => {
          if (other !== vid) {
            other.muted = true;
            other.closest('.live-stage')?.classList.remove('unmuted');
          }
        });
        vid.muted = !vid.muted;
        stage.classList.toggle('unmuted', !vid.muted);
        if (!vid.muted) {
          vid.currentTime = 0;
          vid.play().catch(() => {});
        }
      });
    });
  }

  // Top-level static listeners
  els.modeInterviewBtn.addEventListener('click', () => {
    state.mode = 'interview';
    renderAll();
  });

  els.modePrepBtn.addEventListener('click', () => {
    state.mode = 'prep';
    renderAll();
  });

  els.toggleEmptySlotsBtn.addEventListener('click', () => {
    state.showPendingFrames = !state.showPendingFrames;
    renderAll();
  });

  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (file && state.activeUploadTarget) {
      uploadFileToSlot(file, state.activeUploadTarget.slotId, state.activeUploadTarget.folder);
    }
  });

  els.lightboxCloseBtn.addEventListener('click', () => {
    els.lightbox.hidden = true;
    els.lightboxImg.src = '';
  });

  els.lightbox.addEventListener('click', (e) => {
    if (e.target === els.lightbox) {
      els.lightbox.hidden = true;
      els.lightboxImg.src = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.lightbox.hidden) {
      els.lightbox.hidden = true;
      els.lightboxImg.src = '';
    }
  });

  // ===== Full-screen Story Reel =====
  const reel = {
    el: document.getElementById('reel'),
    stage: document.getElementById('reel-stage'),
    caption: document.getElementById('reel-caption'),
    progress: document.getElementById('reel-progress'),
    closeBtn: document.getElementById('reel-close'),
    prevZone: document.getElementById('reel-prev'),
    nextZone: document.getElementById('reel-next'),
    slides: [],
    index: -1,
    timer: null,
    raf: null,
    story: null,
    active: false
  };

  const LIVE_MIN_DWELL_MS = 2400; // short live clips loop until at least this long
  const PHOTO_DWELL_MS = 2500;
  const CARD_DWELL_MS = 3200;

  function buildSlides(story) {
    const media = (story.mediaSlots || []).filter((m) => m.src);
    const slides = [];
    media.forEach((m, i) => {
      slides.push({
        kind: m.type === 'live' ? 'live' : m.type === 'video' ? 'video' : 'photo',
        src: m.src,
        poster: m.poster || (m.type === 'image' ? m.src : ''),
        caption: m.reelCaption || (m.notes && m.notes.whatHappened) || m.labelEn,
        subs: m.subs || null,
        silent: Boolean(m.silent),
        kicker: `${i + 1} / ${media.length}`
      });
    });
    return slides;
  }

  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const MUSIC_BED = 0.8;   // music level on photos
  const MUSIC_DUCK = 0.22;  // music level under clip audio
  function getMusic() {
    if (!reel.music) {
      const a = document.createElement('audio');
      a.loop = true; a.preload = 'auto'; a.crossOrigin = 'anonymous';
      reel.music = a;
      // Desktop: route through a Web Audio gain node for ducking.
      // iOS: Web Audio is silenced by the ring/silent switch, so play the element directly (pre-attenuated mix, no ducking).
      const Ctx = (!IS_IOS) && (window.AudioContext || window.webkitAudioContext);
      if (Ctx) {
        try {
          reel.actx = new Ctx();
          reel.gain = reel.actx.createGain();
          reel.gain.gain.value = 0;
          reel.actx.createMediaElementSource(a).connect(reel.gain);
          reel.gain.connect(reel.actx.destination);
        } catch (e) { reel.actx = null; reel.gain = null; }
      }
    }
    if (reel.actx && reel.actx.state === 'suspended') reel.actx.resume().catch(() => {});
    return reel.music;
  }
  function fadeMusic(to, ms = 500) {
    if (!reel.music) return;
    if (reel.gain) {
      const g = reel.gain.gain, t = reel.actx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + ms / 1000);
      return;
    }
    if (IS_IOS) { if (to === 0) reel.music.pause(); return; }
    const a = reel.music;
    cancelAnimationFrame(reel.musicRaf);
    const from = a.volume, t0 = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / ms);
      a.volume = from + (to - from) * f;
      if (f < 1) reel.musicRaf = requestAnimationFrame(step);
    };
    reel.musicRaf = requestAnimationFrame(step);
  }

  function makeVideoEl() {
    const v = document.createElement('video');
    v.className = 'reel-media';
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    return v;
  }
  // Two alternating players so the next clip can start before the current one leaves (true cross-dissolve)
  function getReelVideo() {
    if (!reel.videos) { reel.videos = [makeVideoEl(), makeVideoEl()]; reel.vIdx = 0; }
    reel.vIdx = 1 - reel.vIdx;
    return reel.videos[reel.vIdx];
  }
  function currentVideo() { return reel.videos ? reel.videos[reel.vIdx] : null; }
  function stopAllVideos() {
    (reel.videos || []).forEach((v) => { v.onended = null; v.ontimeupdate = null; v.pause(); v.removeAttribute('src'); v.load(); });
  }

  function openReel(storyId) {
    const story = (state.content.stories || []).find((s) => s.id === storyId);
    if (!story) return;
    reel.story = story;
    reel.slides = buildSlides(story);
    reel.index = -1;
    reel.active = true;
    reel.el.hidden = false;
    document.body.style.overflow = 'hidden';
    reel.stage.innerHTML = '';
    reel.caption.innerHTML = '';
    reel.progress.innerHTML = reel.slides.map(() => '<span><i></i></span>').join('');
    // Pause the album's looping clips so they don't compete for decode/audio
    document.querySelectorAll('video[data-live]').forEach((v) => v.pause());
    const url = new URL(window.location.href);
    url.searchParams.set('play', storyId);
    history.replaceState(null, '', url.toString());
    // Unlock audio inside the user's tap: start the first clip unmuted on the shared element, then let showSlide take over
    const firstClip = reel.slides.find((sl) => sl.kind === 'live' || sl.kind === 'video');
    if (firstClip) {
      if (!reel.videos) { reel.videos = [makeVideoEl(), makeVideoEl()]; reel.vIdx = 0; }
      reel.videos.forEach((v) => {
        v.muted = false; v.src = firstClip.src;
        const p = v.play();
        if (p && p.then) p.then(() => { if (!v.isConnected) v.pause(); }).catch(() => {});
      });
    }
    if (story.music) {
      const a = getMusic();
      a.src = IS_IOS ? story.music.replace(/\.m4a$/, '-quiet.m4a') : story.music; if (!reel.gain) a.volume = IS_IOS ? 1 : 0; a.currentTime = 0;
      a.play().catch(() => {});
      fadeMusic(MUSIC_BED, 800);
    }
    showSlide(0);
  }

  function endReel() {
    if (reel.ending) return;
    reel.ending = true;
    clearTimeout(reel.timer);
    cancelAnimationFrame(reel.raf);
    const black = document.createElement('div');
    black.className = 'reel-black';
    reel.el.appendChild(black);
    requestAnimationFrame(() => black.classList.add('on'));
    reel.caption.classList.remove('show');
    fadeMusic(0, 1800);
    setTimeout(() => { black.remove(); reel.ending = false; closeReel(); }, 2000);
  }

  function closeReel() {
    reel.active = false;
    clearTimeout(reel.timer);
    cancelAnimationFrame(reel.raf);
    stopAllVideos();
    if (reel.music) { const a = reel.music; fadeMusic(0, 400); setTimeout(() => { a.pause(); }, 450); }
    reel.stage.innerHTML = '';
    reel.el.hidden = true;
    const launch = document.getElementById('launch');
    if (!launch || launch.hidden) document.body.style.overflow = '';
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    document.querySelectorAll('video[data-live]').forEach((v) => v.play().catch(() => {}));
    const url = new URL(window.location.href);
    url.searchParams.delete('play');
    history.replaceState(null, '', url.toString());
  }

  function setProgress(i, fraction) {
    const bars = reel.progress.children;
    for (let k = 0; k < bars.length; k++) {
      bars[k].classList.toggle('done', k < i);
      const fill = bars[k].firstElementChild;
      if (k === i) fill.style.width = `${Math.min(100, Math.max(0, fraction * 100))}%`;
      else if (k > i) fill.style.width = '0%';
    }
  }

  function runDwell(i, ms, onDone) {
    const startedAt = performance.now();
    const tick = () => {
      if (!reel.active || reel.index !== i) return;
      const f = (performance.now() - startedAt) / ms;
      setProgress(i, f);
      if (f >= 1) onDone();
      else reel.raf = requestAnimationFrame(tick);
    };
    reel.raf = requestAnimationFrame(tick);
  }

  // Warm the browser cache for the next 2 slides so cuts are instant
  function preloadNext(i) {
    reel.warm = reel.warm || {};
    for (let k = i + 1; k <= i + 2; k++) {
      const n = reel.slides[k];
      if (!n || !n.src || reel.warm[n.src]) continue;
      reel.warm[n.src] = true;
      if (n.kind === 'photo') {
        const im = new Image(); im.src = n.src;
      } else {
        const v = document.createElement('video');
        v.preload = 'auto'; v.muted = true; v.src = n.src; v.load();
        if (n.poster) { const im = new Image(); im.src = n.poster; }
        reel.warmEls = reel.warmEls || []; reel.warmEls.push(v);
        if (reel.warmEls.length > 3) reel.warmEls.shift();
      }
    }
  }

  // Freeze the current slide into a static layer so it can cross-fade out over the next one
  function snapshotStage() {
    const stage = reel.stage;
    if (!stage.firstChild) return null;
    const wrap = document.createElement('div');
    wrap.className = 'reel-outgoing';
    const bg = stage.querySelector('.reel-bg');
    if (bg) wrap.appendChild(bg.cloneNode(true));
    const card = stage.querySelector('.reel-card');
    const img = stage.querySelector('img.reel-media');
    const vid = stage.querySelector('video.reel-media');
    if (card) {
      const c = card.cloneNode(true); c.style.animation = 'none'; wrap.appendChild(c);
    } else if (img) {
      const c = img.cloneNode(true); c.style.animation = 'none'; c.className = 'reel-media'; wrap.appendChild(c);
    } else if (vid) {
      vid.ontimeupdate = null; vid.onended = null;
      vid.style.animation = 'none';
      wrap.appendChild(vid); // moves the live element; it keeps playing while it dissolves out
      wrap.dataset.video = '1';
    } else {
      return null;
    }
    return wrap;
  }

  function fitMedia(el, w, h) {
    if (!w || !h) return;
    const mediaAR = w / h, screenAR = window.innerWidth / window.innerHeight;
    const ratio = mediaAR / screenAR;
    el.style.objectFit = (ratio > 0.78 && ratio < 1.28) ? 'cover' : 'contain';
  }

  function showSlide(i) {
    if (!reel.active) return;
    if (i >= reel.slides.length) { endReel(); return; }
    if (i < 0) i = 0;
    clearTimeout(reel.timer);
    cancelAnimationFrame(reel.raf);
    reel.index = i;
    const s = reel.slides[i];
    const outgoing = snapshotStage();
    reel.stage.innerHTML = '';
    let releaseOutgoing = () => {};
    if (outgoing) {
      outgoing.classList.add('hold'); // stays fully visible until the next shot is ready
      reel.stage.appendChild(outgoing);
      let released = false;
      releaseOutgoing = () => {
        if (released) return; released = true;
        outgoing.classList.remove('hold');
        setTimeout(() => {
          const v = outgoing.querySelector('video');
          if (v) { v.pause(); }
          outgoing.remove();
        }, 650);
      };
      // never hold longer than this even if the incoming media is slow
      setTimeout(releaseOutgoing, 1500);
    }
    reel.caption.classList.remove('show');
    reel.caption.innerHTML = '';
    const next = () => showSlide(i + 1);

    if (s.kind === 'card') {
      reel.stage.innerHTML = `
        <div class="reel-card">
          <div>
            <div class="reel-card-num">${escapeHtml(s.num)}</div>
            <h2 class="reel-card-title">${escapeHtml(s.title)}</h2>
            ${s.sub ? `<p class="reel-card-sub">${escapeHtml(s.sub)}</p>` : ''}
          </div>
        </div>`;
      releaseOutgoing();
      runDwell(i, CARD_DWELL_MS, next);
      return;
    }

    reel.caption.innerHTML = `
      <p class="reel-subtitle" id="reel-subtitle"></p>
      <p class="reel-caption-text">
        <span class="reel-caption-kicker">${escapeHtml(s.kicker)}</span>
        ${escapeHtml(s.caption)}
      </p>`;
    if (i === 0) {
      const t = document.createElement('div');
      t.className = 'reel-title';
      t.innerHTML = `<span class="reel-title-num">Story ${escapeHtml(reel.story.number)}</span><h2>${escapeHtml(reel.story.titleEn)}</h2>`;
      reel.stage.appendChild(t);
      setTimeout(() => { t.classList.add('out'); reel.caption.classList.add('show'); }, 2600);
      setTimeout(() => t.remove(), 3400);
    } else {
      requestAnimationFrame(() => reel.caption.classList.add('show'));
    }
    const subEl = document.getElementById('reel-subtitle');
    const updateSubs = (t) => {
      if (!s.subs) return;
      const cue = s.subs.find((c) => t >= c.start && t < c.end);
      const txt = cue ? cue.text : '';
      if (subEl.textContent !== txt) { subEl.textContent = txt; subEl.classList.toggle('show', Boolean(txt)); }
    };

    const bg = document.createElement('div');
    bg.className = 'reel-bg';
    if (s.poster) bg.style.backgroundImage = `url("${s.poster}")`;
    reel.stage.appendChild(bg);

    if (s.kind === 'photo') {
      const img = document.createElement('img');
      img.className = `reel-media kenburns kb-${i % 4}`;
      img.onload = () => { fitMedia(img, img.naturalWidth, img.naturalHeight); releaseOutgoing(); };
      img.src = s.src;
      img.alt = s.caption;
      reel.stage.appendChild(img);
      fadeMusic(MUSIC_BED, 600);
      runDwell(i, i === 0 ? Math.max(PHOTO_DWELL_MS, 4200) : PHOTO_DWELL_MS, next);
      preloadNext(i);
      return;
    }

    fadeMusic(s.silent ? MUSIC_BED : MUSIC_DUCK, 400);
    // Reuse the single video element that was unlocked for sound by the Play tap (iPad Safari)
    const vid = getReelVideo();
    vid.onended = null;
    vid.ontimeupdate = null;
    vid.loop = false;
    vid.muted = false;
    vid.volume = 1;
    vid.removeAttribute('poster');
    vid.style.animation = '';
    vid.classList.add('enter');
    vid.onloadedmetadata = () => fitMedia(vid, vid.videoWidth, vid.videoHeight);
    const ready = () => { vid.classList.remove('enter'); releaseOutgoing(); };
    if ('requestVideoFrameCallback' in vid) vid.requestVideoFrameCallback(ready);
    else vid.onplaying = ready;
    vid.src = s.src;
    reel.stage.appendChild(vid);

    if (s.kind === 'live') {
      // Play the short clip once, then hold on its last frame so every slide lasts at least LIVE_MIN_DWELL_MS
      const startedAt = performance.now();
      vid.ontimeupdate = () => {
        if (reel.index === i) { setProgress(i, (performance.now() - startedAt) / LIVE_MIN_DWELL_MS); updateSubs(vid.currentTime); }
      };
      vid.onended = () => {
        if (!reel.active || reel.index !== i) return;
        const minDwell = i === 0 ? Math.max(LIVE_MIN_DWELL_MS, 4200) : LIVE_MIN_DWELL_MS;
        const remaining = minDwell - (performance.now() - startedAt);
        if (remaining <= 0) next();
        else runDwell(i, minDwell, next);
      };
      vid.play().catch(() => {});
      // Safety: if the clip never ends (decode stall), move on
      reel.timer = setTimeout(() => { if (reel.active && reel.index === i) next(); }, LIVE_MIN_DWELL_MS + 6000);
    } else {
      vid.ontimeupdate = () => {
        if (reel.index === i && vid.duration) { setProgress(i, vid.currentTime / vid.duration); updateSubs(vid.currentTime); }
      };
      vid.onended = () => { if (reel.active && reel.index === i) next(); };
      vid.play().catch(() => {});
    }

    preloadNext(i);
  }

  reel.closeBtn.addEventListener('click', closeReel);
  // Swipe left/right (iPad / phone)
  let touchX = null, touchY = null;
  reel.el.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchX = t.clientX; touchY = t.clientY;
  }, { passive: true });
  reel.el.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX, dy = t.clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      e.preventDefault();
      reel.swiped = true;
      if (dx < 0) showSlide(reel.index + 1); else showSlide(Math.max(0, reel.index - 1));
      setTimeout(() => { reel.swiped = false; }, 400);
    }
  });
  reel.nextZone.addEventListener('click', () => { if (!reel.swiped) showSlide(reel.index + 1); });
  reel.prevZone.addEventListener('click', () => { if (!reel.swiped) showSlide(Math.max(0, reel.index - 1)); });
  document.addEventListener('keydown', (e) => {
    if (!reel.active) return;
    if (e.key === 'Escape') closeReel();
    else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); showSlide(reel.index + 1); }
    else if (e.key === 'ArrowLeft') showSlide(Math.max(0, reel.index - 1));
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-play-reel]');
    if (btn && !btn.classList.contains('disabled')) openReel(btn.getAttribute('data-play-reel'));
  });

  // ===== Launch screen (default landing unless ?view=album or ?mode=prep) =====
  const launchEl = document.getElementById('launch');
  const launchTiles = document.getElementById('launch-tiles');

  function renderLaunch() {
    const stories = state.content.stories || [];
    launchTiles.innerHTML = stories.map((s) => {
      const media = (s.mediaSlots || []).filter((m) => m.src);
      const first = media[0];
      const thumb = first ? (first.poster || first.src) : '';
      const empty = media.length === 0;
      return `
        <button type="button" class="launch-tile ${empty ? 'empty' : ''}" data-play-reel="${escapeHtml(s.id)}" ${empty ? 'disabled' : ''}>
          ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" />` : ''}
          <div class="launch-tile-scrim"></div>
          <div class="launch-tile-text">
            <div class="launch-tile-num">STORY ${escapeHtml(s.number)}</div>
            <h2 class="launch-tile-title">${escapeHtml(s.titleEn)}</h2>
            <span class="launch-tile-play">${empty ? 'Media coming soon' : '▶ Play'}</span>
          </div>
        </button>`;
    }).join('');
  }

  function showLaunch() {
    renderLaunch();
    launchEl.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideLaunch() {
    launchEl.hidden = true;
    document.body.style.overflow = '';
  }

  // ===== Offline (service worker precache) =====
  const offlineBtn = document.getElementById('offline-btn');
  const offlineStatus = document.getElementById('offline-status');
  function allMediaUrls() {
    const urls = [];
    const c = state.content;
    if (c.coverSlot && c.coverSlot.src) urls.push(c.coverSlot.src);
    for (const st of c.stories || []) {
      if (st.music) urls.push(st.music);
      for (const m of st.mediaSlots || []) {
        if (m.src) urls.push(m.src);
        if (m.poster) urls.push(m.poster);
      }
    }
    return urls;
  }
  async function saveOffline() {
    if (!('serviceWorker' in navigator)) { offlineStatus.textContent = 'Not supported in this browser'; return; }
    offlineBtn.disabled = true;
    offlineStatus.textContent = 'Preparing…';
    const reg = await navigator.serviceWorker.register(BASE + 'sw.js');
    await navigator.serviceWorker.ready;
    const sw = reg.active || reg.waiting || reg.installing;
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      const { done, total, failed, complete } = e.data;
      offlineStatus.textContent = complete
        ? (failed.length ? `Saved with ${failed.length} missing` : `✓ Saved for offline (${total} files)`)
        : `Saving ${done} / ${total}…`;
      if (complete) { offlineBtn.classList.add('saved'); offlineBtn.disabled = false; localStorage.setItem('haisu-offline', String(Date.now())); setTimeout(() => { offlineStatus.textContent = ''; }, 4000); }
    };
    sw.postMessage({ type: 'precache', urls: allMediaUrls(), port: ch.port2 }, [ch.port2]);
  }
  if (offlineBtn) {
    offlineBtn.addEventListener('click', saveOffline);
    if (localStorage.getItem('haisu-offline')) { offlineBtn.classList.add('saved'); offlineBtn.title = 'Saved for offline · tap to re-check'; }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {});
  }

  fetchSiteData()
    .then(() => {
      const playId = params.get('play');
      const wantsAlbum = params.get('view') === 'album' || state.mode === 'prep';
      if (!wantsAlbum) showLaunch();
      if (playId) openReel(playId);
    })
    .catch((err) => {
      console.error(err);
      showToast('Error loading site content', 5000);
    });
})();
