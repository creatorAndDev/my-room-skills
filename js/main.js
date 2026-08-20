// browsers restore the previous scroll offset on reload by default — the
// page should always reopen at the top instead
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

document.addEventListener('DOMContentLoaded', function () {
	App.viewportHeight.init();
	App.scrollRoll.init();
	App.cursorFx.init();
	App.heroMascot.init();
	App.lampGlowMask.init();
	// page starts fully dark with only the lamp itself visible above the
	// cover — the reveal only plays once the visitor clicks the bulb, rather
	// than firing automatically on load
	App.ideaLamp.init({
		onReveal: function () {
			App.lampGlowMask.reveal();
		},
	});
	App.tabs.init({
		onChange: function () {
			App.scrollRoll.refresh();
		},
	});
	App.skillSpotlight.init();
});
