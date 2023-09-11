function unpack_array_object(xs) {
	if (xs === null) return null;
	let o = {};
	for (const [k,v] of xs) {
		o[k] = v;
	}
	return o;
}

function present(o) {
	document.getElementById("debug").innerText = JSON.stringify(o);
}

window.addEventListener("load", () => {
	let seen_serial = 0;
	function loop() {
		fetch("poll", {
			method: "POST",
			body: JSON.stringify({
				seen_serial: seen_serial,
			}),
		}).then(x => x.json().then(x => {
			if (x) {
				seen_serial = x[0];
				present(unpack_array_object(x[1]));
			}
			loop();
		})).catch(e => {
			console.error(e);
			document.getElementById("debug").innerText = "DISCONNECTED"
			seen_serial = 0;
			setTimeout(loop, 1000);
		});
	}
	loop();
});
