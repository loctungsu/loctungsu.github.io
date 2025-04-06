document.addEventListener("DOMContentLoaded", () => {
	const ageL = document.getElementById("age");

	setInterval(() => {
		const birthTime = dayjs(1000944000000); // Sept 20, 2001 @ 00:00:00 UTC
		const now = dayjs();
		const age = now.diff(birthTime, 'year', true); // fractional years
		ageL.innerText = `(${age.toFixed(9)})`; // show in parentheses
	}, 100); // update every 100ms
});
