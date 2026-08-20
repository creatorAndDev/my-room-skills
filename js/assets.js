window.App = window.App || {};

App.cursorFx = (function () {
	function init() {
		var cursorEl = document.querySelector('.cursor-trail');
		var pointerFine = matchMedia('(pointer: fine)').matches;
		var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!pointerFine || reducedMotion || !cursorEl) return;

		var html = document.documentElement;
		html.classList.add('has-cursor-trail');

		var on = false,
			isText = false,
			isLink = false;

		function onMove(e) {
			cursorEl.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
			if (!on) {
				on = true;
				cursorEl.classList.add('on');
			}
		}
		function onOver(e) {
			var target = e.target;
			if (!(target instanceof Element)) return;
			var text = !!target.closest("input, textarea, [contenteditable='true']");
			var link = !text && !!target.closest("a, button, [role='button'], select, label, summary");
			if (text !== isText || link !== isLink) {
				isText = text;
				isLink = link;
				cursorEl.classList.toggle('is-text', text);
				cursorEl.classList.toggle('is-link', link);
			}
		}
		function onLeave() {
			on = false;
			isText = false;
			isLink = false;
			cursorEl.classList.remove('on', 'is-text', 'is-link');
		}

		addEventListener('pointermove', onMove, { passive: true });
		addEventListener('pointerover', onOver, { passive: true });
		html.addEventListener('mouseleave', onLeave);
	}
	return { init: init };
})();

window.App = window.App || {};

App.heroMascot = (function () {
	// targets get set instantly on pointer events; the smoothed values ease
	// toward them every frame instead of jumping, so tracking (and the return
	// to rest on mouseleave) both read as smooth motion rather than a snap.
	// The cat's head pose only switches once the smoothed input clears a
	// hysteresis threshold and a minimum dwell time, so it can't flicker
	// between two adjacent poses near a boundary.
	var CAT_DAMPING = 0.14;
	var CAT_ENTER = 0.35;
	var CAT_EXIT = 0.15;
	var CAT_MIN_DWELL = 90;
	var CAT_INFLUENCE = 320;

	function axisBucket(current, value) {
		if (current === 0) {
			if (value > CAT_ENTER) return 1;
			if (value < -CAT_ENTER) return -1;
			return 0;
		}
		if (current === 1) return value < CAT_EXIT ? 0 : 1;
		return value > -CAT_EXIT ? 0 : -1;
	}

	function init() {
		var mascotEl = document.querySelector('[data-mascot]');
		var catEl = document.querySelector('[data-cat]');
		var eyeEls = document.querySelectorAll('[data-eye]');
		if (!mascotEl || !catEl) return;

		var targetEyeX = 0,
			targetEyeY = 0,
			targetCatX = 0,
			targetCatY = 0,
			smoothCatX = 0,
			smoothCatY = 0,
			activeCol = 0,
			activeRow = 0,
			lastSwitch = 0,
			eyeX = 0,
			eyeY = 0,
			raf = 0;

		function onMove(e) {
			var box = mascotEl.getBoundingClientRect();
			var nx = Math.max(-1, Math.min(1, (2 * (e.clientX - box.left)) / box.width - 1)),
				ny = Math.max(-1, Math.min(1, (2 * (e.clientY - box.top)) / box.height - 1));
			targetEyeX = 3.2 * nx;
			targetEyeY = 2.4 * ny;

			var catBox = catEl.getBoundingClientRect();
			var anchorX = catBox.left + catBox.width / 2,
				anchorY = catBox.top + catBox.height / 2;
			targetCatX = Math.max(-1, Math.min(1, (e.clientX - anchorX) / CAT_INFLUENCE));
			targetCatY = Math.max(-1, Math.min(1, (e.clientY - anchorY) / CAT_INFLUENCE));
		}
		function onLeave() {
			targetEyeX = 0;
			targetEyeY = 0;
			targetCatX = 0;
			targetCatY = 0;
		}
		function tick(now) {
			eyeX += (targetEyeX - eyeX) * 0.14;
			eyeY += (targetEyeY - eyeY) * 0.14;
			var eyeTransform = 'translate3d(calc(-50% + ' + eyeX + 'px),calc(-50% + ' + eyeY + 'px),0)';
			eyeEls.forEach(function (el) {
				el.style.transform = eyeTransform;
			});

			smoothCatX += (targetCatX - smoothCatX) * CAT_DAMPING;
			smoothCatY += (targetCatY - smoothCatY) * CAT_DAMPING;
			var candCol = axisBucket(activeCol, smoothCatX),
				candRow = axisBucket(activeRow, smoothCatY);
			if ((candCol !== activeCol || candRow !== activeRow) && now - lastSwitch > CAT_MIN_DWELL) {
				activeCol = candCol;
				activeRow = candRow;
				lastSwitch = now;
				catEl.style.backgroundPosition = (activeCol + 1) * 50 + '% ' + (activeRow + 1) * 50 + '%';
			}
			raf = requestAnimationFrame(tick);
		}
		addEventListener('pointermove', onMove, { passive: true });
		document.documentElement.addEventListener('mouseleave', onLeave);
		raf = requestAnimationFrame(tick);
	}
	return { init: init };
})();

window.App = window.App || {};

App.ideaLamp = (function () {
	// "Click" stays hidden for a while after load, then breathes in/out on a
	// loop, re-landing at a new spot each time it's invisible (opacity 0) so
	// the jump is never actually seen — only the fade is. Alternates
	// left/right of the bulb and keeps a minimum clearance so the label
	// never lands on top of the bulb itself
	var HINT_DELAY_MS = 3000;
	var HINT_CYCLE_MS = 3000;

	// brushing the cursor past the bulb knocks it sideways, like a real hanging
	// lamp — a simple damped spring rather than a scripted animation, so the
	// nudge strength tracks how fast/close the swipe actually was and it always
	// settles back to hanging straight on its own
	var NUDGE_RADIUS = 70;
	var NUDGE_IMPULSE = 0.018;
	// caps how far a single sampled pointer delta can push things — pointermove
	// can fire faster than the animation frame (high-poll-rate mice/trackpads)
	// or report one big jump after a fast flick, either of which would otherwise
	// slam the spring in one step instead of easing into it
	var NUDGE_MAX_STEP = 20;
	var NUDGE_SPRING = 0.014;
	var NUDGE_FRICTION = 0.93;
	// a soft, generously-sized safety net rather than the actual resting range
	// — the spring itself keeps normal swipes well under this, so it's there
	// to catch pathological input, not to be felt as a wall in everyday use
	var NUDGE_SAFETY_MAX = 22;

	// pre-reveal idle sway — driven from the same loop as the cursor nudge, so
	// the wire flexes during the idle sway too, not just after a cursor nudge
	var IDLE_PERIOD_MS = 4200;
	var IDLE_AMPLITUDE = 3.5;

	function init(opts) {
		opts = opts || {};
		var onReveal = opts.onReveal || function () {};

		var bulbEl = document.querySelector('[data-lamp-bulb]');
		var nudgeEl = document.querySelector('[data-lamp-nudge]');
		var swingEl = document.querySelector('[data-lamp-swing]');
		var wirePathEl = document.querySelector('[data-lamp-wire]');
		var hintEl = document.querySelector('[data-lamp-hint]');
		if (!bulbEl) return;

		// starts grayscale and glow-less (as if unlit/off) and settles into
		// full color + glow — lamp-glow-mask.js's own black cover handles
		// hiding everything at load, so the bulb itself no longer needs to
		// fade its own opacity too
		var intensity = 0;

		var showHint = false,
			hintSide = 1,
			hintOffsetX = 34,
			hintOffsetY = 0;
		var hintDelayTimer = 0,
			hintTimer = 0,
			prevSide = 0,
			prevX = null;

		// mirrors the original template's `v-if="intensity <= 0 && showHint"`
		// — the delay timer only sets showHint, it doesn't know whether the
		// bulb was already clicked in the meantime
		function updateHintVisibility() {
			if (!hintEl) return;
			hintEl.hidden = !(intensity <= 0 && showHint);
		}
		function applyHintStyle() {
			if (!hintEl) return;
			hintEl.style.transform =
				'translate(' + hintOffsetX + 'px, ' + hintOffsetY + 'px) translateX(' + (hintSide < 0 ? '-100%' : '0') + ')';
		}
		// rejects picks that would land on the same side within a few px of
		// last time, so it never visibly repeats the same spot twice running
		function randomizeHint() {
			var side, x;
			var attempts = 0;
			do {
				side = Math.random() < 0.5 ? -1 : 1;
				var clearance = 34 + Math.random() * 24; // bulb radius (~13px) plus a safe gap
				x = side * clearance;
				attempts++;
			} while (attempts < 6 && side === prevSide && prevX !== null && Math.abs(x - prevX) < 14);
			prevSide = side;
			prevX = x;
			hintSide = side;
			hintOffsetX = x;
			hintOffsetY = Math.round((Math.random() - 0.5) * 18);
			applyHintStyle();
		}

		// .idea-lamp is display:none below 701px, but a running interval
		// doesn't know that and would keep silently re-randomizing the hint's
		// position while hidden (e.g. docking devtools can push the viewport
		// under that width) — so whenever it becomes visible again, it'd
		// already be sitting at some new spot with no transition ever having
		// played, reading as a jump to a random place. Pausing the cycle
		// while hidden keeps it exactly where it was left the moment it's
		// visible again
		var lampVisibleQuery = matchMedia('(min-width: 701px)');
		function onLampVisibilityChange() {
			if (lampVisibleQuery.matches) {
				if (showHint && !hintTimer) hintTimer = setInterval(randomizeHint, HINT_CYCLE_MS);
				startNudgeLoop();
			} else {
				if (hintTimer) {
					clearInterval(hintTimer);
					hintTimer = 0;
				}
				stopNudgeLoop();
			}
		}

		hintDelayTimer = setTimeout(function () {
			showHint = true;
			updateHintVisibility();
			randomizeHint();
			onLampVisibilityChange();
		}, HINT_DELAY_MS);
		lampVisibleQuery.addEventListener('change', onLampVisibilityChange);

		// swings gently until clicked; the click itself gives the whole
		// fixture a quick downward tug that springs back, like the cord got
		// pulled
		var tugTimer = 0;
		function onBulbClick() {
			// only the first click matters — once revealed, the bulb goes
			// inert (also enforced via disabled on the button, belt-and-suspenders)
			if (intensity > 0) return;
			intensity = 1;
			bulbEl.disabled = true;
			bulbEl.style.filter = 'grayscale(0)';
			bulbEl.style.boxShadow = '';
			showHint = false;
			updateHintVisibility();
			if (hintTimer) {
				clearInterval(hintTimer);
				hintTimer = 0;
			}
			onReveal();

			if (swingEl) {
				swingEl.classList.remove('tugged');
				requestAnimationFrame(function () {
					requestAnimationFrame(function () {
						swingEl.classList.add('tugged');
					});
				});
				clearTimeout(tugTimer);
				tugTimer = setTimeout(function () {
					swingEl.classList.remove('tugged');
				}, 700);
			}
		}
		bulbEl.addEventListener('click', onBulbClick);

		var nudgeAngle = 0,
			nudgeVel = 0,
			wireBend = 0,
			lastMoveX = null,
			pendingImpulse = 0,
			nudgeRaf = 0,
			idleStart = null;

		function onWindowMove(e) {
			// only once the lamp's been clicked on — while it's still
			// swinging on its own pre-reveal, a cursor nudge on top would
			// just look like a glitch
			if (intensity <= 0) {
				lastMoveX = e.clientX;
				return;
			}
			if (lastMoveX !== null && nudgeEl) {
				var rect = nudgeEl.getBoundingClientRect();
				var anchorX = rect.left;
				var anchorY = rect.bottom + 19; // roughly the bulb's own center, hanging below the wire
				var dist = Math.hypot(e.clientX - anchorX, e.clientY - anchorY);
				if (dist < NUDGE_RADIUS) {
					var dx = Math.max(-NUDGE_MAX_STEP, Math.min(NUDGE_MAX_STEP, e.clientX - lastMoveX));
					// rotate() pivots from the top, so a positive angle swings
					// the hanging bulb *left* (and negative, right) — inverted
					// from the swipe direction, so the impulse sign flips to
					// match. Deltas only accumulate here; nudgeTick applies
					// them once per frame so the input sampling rate can't
					// outrun the physics
					pendingImpulse += -dx * NUDGE_IMPULSE * (1 - dist / NUDGE_RADIUS);
				}
			}
			lastMoveX = e.clientX;
		}

		var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

		function nudgeTick(t) {
			if (intensity <= 0) {
				// t is the time since the page's own navigation start, not
				// since this loop began — using it directly would make the
				// sway jump straight to whatever phase that raw timestamp
				// lands on the moment this starts, instead of always starting
				// from hanging straight. Anchor to the first frame here
				if (idleStart === null) idleStart = t;
				nudgeAngle = -IDLE_AMPLITUDE * Math.cos((2 * Math.PI * (t - idleStart)) / IDLE_PERIOD_MS);
				nudgeVel = 0;
			} else {
				idleStart = null;
				nudgeVel += pendingImpulse;
				pendingImpulse = 0;
				nudgeVel += -nudgeAngle * NUDGE_SPRING;
				nudgeVel *= NUDGE_FRICTION;
				nudgeAngle = Math.max(-NUDGE_SAFETY_MAX, Math.min(NUDGE_SAFETY_MAX, nudgeAngle + nudgeVel));
			}
			if (nudgeEl) nudgeEl.style.transform = 'rotate(' + nudgeAngle.toFixed(2) + 'deg)';
			// the wire itself bows slightly opposite the lean, like it's
			// flexing under the swing rather than staying a rigid rod —
			// purely cosmetic. Eased toward the target instead of following
			// the angle 1:1 each frame, so it visibly trails the motion
			if (wirePathEl) {
				// nudgeAngle's sign is inverted from the bulb's actual screen
				// direction (rotate() pivots from the top — see onWindowMove),
				// so bending the same sign as nudgeAngle is what puts the
				// curve on the opposite side from the bulb, like the weight
				// is dragging against it
				var targetBend = Math.max(-10, Math.min(10, nudgeAngle * 1.1));
				wireBend += (targetBend - wireBend) * 0.12;
				wirePathEl.setAttribute('d', 'M0,-30 Q' + wireBend.toFixed(2) + ',40 0,110');
			}
			nudgeRaf = requestAnimationFrame(nudgeTick);
		}
		// .idea-lamp is display:none below 701px — this loop has no idea, and
		// would otherwise keep computing and writing a transform every frame
		// onto an element nobody can see, for as long as the tab stays open
		function startNudgeLoop() {
			if (nudgeRaf || reducedMotion || !lampVisibleQuery.matches) return;
			nudgeRaf = requestAnimationFrame(nudgeTick);
		}
		function stopNudgeLoop() {
			cancelAnimationFrame(nudgeRaf);
			nudgeRaf = 0;
		}

		// the idle sway + wire flex should still play for everyone; only the
		// cursor-driven nudge itself needs a real pointer to make sense
		if (!reducedMotion) {
			if (matchMedia('(pointer: fine)').matches) {
				addEventListener('pointermove', onWindowMove, { passive: true });
			}
			startNudgeLoop();
		}
	}
	return { init: init };
})();

window.App = window.App || {};

App.lampGlowMask = (function () {
	var maskEl = null,
		overlayEl = null,
		intensity = 0;

	// while still covering the page, block every interaction behind it
	// (clicks and, since a pointer-events:auto full-viewport layer also
	// captures wheel input, scrolling) — only the lamp itself stays
	// reachable, via its own higher z-index. Gated to desktop widths: the
	// lamp and this overlay are both display:none on mobile, so gating there
	// would strand mobile visitors with no way to ever unlock the page
	var desktopQuery = matchMedia('(min-width: 701px)');

	function updateLock() {
		document.documentElement.classList.toggle('lamp-locked', intensity <= 0 && desktopQuery.matches);
	}

	// a hole punched in the black cover, centered on the lamp, that grows to
	// swallow the whole viewport as intensity goes 0 -> 1 — sized well past
	// any realistic viewport diagonal so even the far corners end up inside
	// the gradient's fully-transparent inner band once revealed
	function setIntensity(v) {
		intensity = v;
		if (overlayEl) overlayEl.style.setProperty('--reveal-r', v > 0 ? '900vmax' : '0px');
		if (maskEl) maskEl.classList.toggle('blocking', v <= 0);
		updateLock();
	}

	function reveal() {
		setIntensity(1);
	}

	function init() {
		maskEl = document.querySelector('.lamp-glow-mask');
		overlayEl = document.querySelector('.entrance-overlay');
		desktopQuery.addEventListener('change', updateLock);
		updateLock();
	}
	return { init: init, reveal: reveal };
})();

window.App = window.App || {};

App.scrollRoll = (function () {
	var ROLL_SELECTOR = '.intro,.nav-tabs,.skill-hitbox,.about-intro,.contact-section,.wrapper>.footer';
	var raf = 0;
	var railEl = null;

	function apply() {
		raf = 0;
		var progress = Math.round((scrollY / (document.documentElement.scrollHeight - innerHeight)) * 100) || 0;
		if (railEl) railEl.style.width = progress + '%';
		document.querySelectorAll('.roll-band').forEach(function (el) {
			var r = el.getBoundingClientRect(),
				// px of the element hidden past the top / bottom edge, scaled by its
				// own height — so leave reaches its max exactly when the element's
				// bottom reaches the top edge (fully hidden), whatever its size
				hiddenTop = Math.max(0, -r.top),
				hiddenBottom = Math.max(0, r.bottom - innerHeight);
			var smooth = function (x) {
					return x * x * (3 - 2 * x);
				},
				// only "entering" while the element's top hasn't reached the
				// viewport's top edge yet (r.top > 0) — otherwise an element
				// taller than the viewport itself (e.g. .intro's 700px
				// min-height on a short window) reads hiddenBottom as
				// nonzero purely from its own height, not from scrolling,
				// and rolls in a tilt with zero scroll ever happening
				enter = r.top > 0 ? smooth(Math.min(1, hiddenBottom / Math.max(1, r.height))) : 0,
				leave = smooth(Math.min(1, hiddenTop / Math.max(1, r.height)));
			el.style.setProperty('--roll-origin-y', enter > 0 ? '4%' : leave > 0 ? '96%' : '50%');
			el.style.setProperty('--roll-angle', (-14 * enter + 28 * leave).toFixed(2) + 'deg');
			el.style.setProperty('--roll-y', (6 * enter - 10 * leave).toFixed(1) + 'px');
			el.style.setProperty('--roll-opacity', (1 - 0.1 * enter - 0.14 * leave).toFixed(3));
		});
	}
	function onScroll() {
		if (!raf) raf = requestAnimationFrame(apply);
	}
	// resize gets its own debounced handler, separate from scroll's rAF
	// throttle — a phone rotating orientation fires a burst of resize events
	// while `100dvh` (and .intro's height) settles, and recomputing the tilt
	// on every one of those mid-flight reads made it visibly jitter; waiting
	// for the burst to actually stop avoids that without disabling the
	// effect on touch devices entirely
	var resizeTimer = 0;
	function onResize() {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(onScroll, 200);
	}
	function refresh() {
		document.querySelectorAll(ROLL_SELECTOR).forEach(function (el) {
			el.classList.add('roll-band');
		});
		apply();
	}
	function init() {
		railEl = document.querySelector('.rail > i');
		addEventListener('scroll', onScroll, { passive: true });
		addEventListener('resize', onResize, { passive: true });
		refresh();
	}
	return { init: init, refresh: refresh };
})();

window.App = window.App || {};

App.skillSpotlight = (function () {
	function moveSpot(e) {
		var target = e.currentTarget;
		var r = target.getBoundingClientRect();
		target.style.setProperty('--spot-x', e.clientX - r.left + 'px');
		target.style.setProperty('--spot-y', e.clientY - r.top + 'px');
	}
	function init() {
		document.querySelectorAll('.skill-card').forEach(function (card) {
			card.addEventListener('pointermove', moveSpot);
		});
	}
	return { init: init };
})();

window.App = window.App || {};

App.tabs = (function () {
	var TAB_IDS = ['skills', 'me'];

	function init(opts) {
		opts = opts || {};
		var onChange = opts.onChange || function () {};

		var navEl = document.querySelector('[data-tabs-nav]');
		var worksEl = document.querySelector('[data-works]');
		var panels = {
			skills: document.getElementById('panel-skills'),
			me: document.getElementById('panel-me'),
		};
		var buttons = navEl ? navEl.querySelectorAll('[data-tab-btn]') : [];

		function setActive(id, silent) {
			if (TAB_IDS.indexOf(id) === -1) id = 'skills';

			buttons.forEach(function (btn) {
				var isActive = btn.getAttribute('data-tab-btn') === id;
				btn.classList.toggle('is-active', isActive);
				btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
			});
			Object.keys(panels).forEach(function (key) {
				if (panels[key]) panels[key].hidden = key !== id;
			});
			if (worksEl) worksEl.setAttribute('data-tab', id);
			if (!silent) history.replaceState(null, '', '#' + id);
			onChange();
		}

		buttons.forEach(function (btn) {
			btn.addEventListener('click', function () {
				setActive(btn.getAttribute('data-tab-btn'));
			});
		});

		// initial tab comes from the URL hash, same as a reload/deep link
		// should restore whichever tab was open
		setActive(location.hash.slice(1) || 'skills', true);
	}
	return { init: init };
})();

window.App = window.App || {};

// mobile `dvh` doesn't reliably track the real visible viewport across
// every browser/engine (Chromium's own device-toolbar emulation can lag
// window.innerHeight by tens of px) — measuring innerHeight directly and
// feeding it back as a CSS custom property sidesteps that entirely
App.viewportHeight = (function () {
	function setVh() {
		document.documentElement.style.setProperty('--vh', innerHeight * 0.01 + 'px');
	}
	function init() {
		setVh();
		addEventListener('resize', setVh, { passive: true });
		addEventListener('orientationchange', setVh, { passive: true });
	}
	return { init: init };
})();

