#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function IMPL_TIME() {
	let args = [...arguments];
	const t0 = Date.now();
	let what;
	for (const arg of args) {
		if (what === undefined && typeof arg === "string") {
			what = arg;
		} else if (typeof arg === "function") {
			arg();
		} else {
			throw new Error("unhandled arg " + arg);
		}
	}
	const dt = (Date.now() - t0) * 1e-3;
	if (!what) what = "*unlabled*";
	let left = what + " ";
	while (left.length < 20) left += left.length & 1 ? "." : " ";
	console.log(left + " : " + dt.toFixed(3) + "s");
}

function NO_TIME() {
	for (const arg of [...arguments]) if (typeof arg === "function") arg();
}

const TIME = 1 ? IMPL_TIME : NO_TIME;

const resolve_file = (filename) => fs.readFileSync(path.join(__dirname, filename), {"encoding": "utf8"});
const compiler = require("./compiler")(resolve_file);

const ESC   = "\u001b";
const NORM  =  ESC+"[0m";
const FAIL  =  txt => ESC+"[1;93;41m"+txt+NORM; // bold; fg=bright yellow; bg=red
const OK    =  txt => ESC+"[1;92m"+txt+NORM;    // bold; fg=bright green

class TestError extends Error {}

TIME("4st test", () => {
	for (let file of ["selftest.4st"]) {
		const o = compiler.compile(file);

		const test_prg = o.trace_program_debug((depth,name) => compiler.is_test_word(name));
		//console.log(JSON.stringify(test_prg));

		for (let xi = 0; xi < test_prg.export_word_indices.length; xi++) {
			const word_name = test_prg.export_word_names[xi];
			try {
				const MAX_INSTRUCTIONS = 1e8;
				let vm_state = test_prg.new_state();
				vm_state.set_iteration_counter(MAX_INSTRUCTIONS);
				vm_state.set_pc_to_export_word_index(xi);

				while (vm_state.can_run()) {
					vm_state = test_prg.vm(test_prg.vm_words, vm_state);
					if (!vm_state.did_exit()) {
						const pos = vm_state.get_position_human();
						if (vm_state.broke_at_assertion()) {
							throw new TestError("ASSERTION FAILED at " + pos);
						} else if (vm_state.broke_at_breakpoint()) {
							// OK: some tests break
						} else {
							throw new TestError("unhandled exit at " + pos);
						}
					}
				}
				if (!vm_state.did_exit()) {
					throw new TestError("not a clean exit at " + vm_state.get_position_human());
				}

				const n_ops = MAX_INSTRUCTIONS - vm_state.get_iteration_counter();
				const stack = vm_state.get_stack();
				const rstack = vm_state.get_rstack();
				if (stack.length !== 0 || rstack.length !== 0)  throw new TestError("unclean stack after test: " + JSON.stringify([stack,"/R",rstack]));
				console.log(OK("TEST " + word_name + " OK (" + n_ops + "op)"));
			} catch (err) {
				if (err instanceof TestError) {
					console.log(FAIL("TEST ERROR in :" + word_name + " : " + err));
				} else {
					throw err;
				}
			}
		}

		//const main_prg = (true ? o.trace_program_debug : o.trace_program_release)((depth,name) => depth === 0 && is_main_word(name));
		//console.log(main_prg);
	}
});
