// npx uglify-js vm4stub.js --exprssion --compress --mangle eval,reserved=['s','o','u'] -o vm4stub.min.js

// convention: if a function argument begins with "__" it's not a real
// argument, but for defining local variables

// convention: put /*NOMANGL*/ in-front of variable declarations used in
// eval()s, meaning they should not be mangled. also add the name to the
// reserved=[] list above.

(words, entry) => {
	let
		current_opcode,
		current_oparg,

		pc = [entry, 0], // set program counter tuple to "main"

		stack = [],  // main/value stack
		/*NOMANGL*/s = n=>stack.splice(-n),      // pop n
		/*NOMANGL*/o = _=>s(1)[0],               // p[o]p 1
		/*NOMANGL*/u = v=>stack.push(v),         // p[u]sh

		rstack = [], // return/loop stack

		advance = __tup => [current_opcode, current_oparg] = words[pc[0]][pc[1]++] || [0/*<-implicit return at end of instruction string*/], // get next instruction

		ifskip = (__depth) => {
			__depth = 0;
			for (;;) {
				advance();
				// stop at "else" or "endif" when not nested:
				if (!__depth && (current_opcode == 2 || current_opcode == 3)) break;
				// skip over nested if...endif:
				__depth += (current_opcode == 1) - (current_opcode == 3); // "if" increments depth, "endif" decrements
				//__depth += [,1,,-1][current_opcode]|0; // not shorter after uglify
			}
		},

		ops = [],
		ssplit = s=>s.split(" "),
		push_op = f=>ops.push(f),
		push_opn1_expr = (n,expr)=>push_op(eval("_=>{let[a,b]=s("+n+");u("+expr+")}")),
		call_word = goto_word_index => {
			rstack.push(pc);
			pc = [goto_word_index,0];
		}
		;

	/*ST4{STATIC*/
	push_op(__top=>{ // return
		for (;;) {
			__top = rstack.pop();
			if (typeof __top == "number") continue; // unroll past loop related rstack entries
			if (typeof __top == "undefined") return 1; // return to void (stop executing)
			pc = __top; // normal return
			break;
		}
	});
	// if/else/endif:
	push_op(_ => o() ? 0 : ifskip());    // if    : skip until "else" if popped value is false
	push_op(_ => ifskip());              // else  : skip until "endif"
	push_op(_ => 0);                     // endif : no-op; used as marker for ifskip()
	/*ST4}STATIC*/

	/*ST4:PUSH_IMM*/push_op(_ => u(current_oparg) * 0);

	/*ST4{TIMES_LOOP*/
	push_op(_ => { // times
		rstack.push(o());
		rstack.push(pc[1]);
	});
	push_op(_ => { // loop
		if (--rstack[rstack.length-2]) {
			pc[1] = rstack[rstack.length-1];
		} else {
			rstack.pop();
			rstack.pop();
		}
	});
	/*ST4}TIMES_LOOP*/

	/*ST4{DO_WHILE*/
	push_op(_ => { // do
		rstack.push(pc[1]);
	});
	push_op(_ => { // while
		if (o()) {
			pc[1] = rstack[rstack.length-1];
		} else {
			rstack.pop();
		}
	});
	/*ST4}DO_WHILE*/

	/*ST4:CALL_IMM*/push_op(_ => call_word(current_oparg)); // immediate call
	/*ST4:CALL_POP*/push_op(_ => call_word(o())); // indirect/popped call

	/*ST4:DUP*/push_op(__a => { __a = o(); u(__a); u(__a); }); // dup (a -- a a)
	//push_op(_ => { u(stack[stack.length-1]) }); // dup (a -- a a)
	/*ST4:POP*/push_op(__a => { o() }); // pop (a --)
	/*ST4:EXCHANGE*/push_op((__a,__b) => { __a = o(); __b = o(); u(__b); u(__a); }); // exchange (a b -- b a)
	/*ST4:TRIROT*/push_op((__a,__b,__c) => { __a = o(); __b = o(); __c = o(); u(__b); u(__c); u(__a); }); // trirot (a b c -- b c a)
	/*ST4{DEBUG*/
	push_op(_ => { if (!o()) throw new Error("ASSERTION FAILED"); })
	push_op(_ => { console.log("STACK", stack, "/R", rstack); });
	/*ST4}DEBUG*/

	for (op of ssplit(ST4_INFIX))  push_opn1_expr(2, "a"+op+"b");
	for (op of ST4_PREFIX)         push_opn1_expr(1, op+"a");
	for (op of ssplit(ST4_MATH1))  push_opn1_expr(1, "Math."+op+"(a)");

	for (;advance(),!ops[current_opcode]();); // execution loop

	return [stack, rstack]; // XXX don't bother in "production"
}
