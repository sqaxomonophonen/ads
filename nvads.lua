uv = require("luv")

function ADS()
	vim.lsp.start({
		name = 'hack4st',
		cmd      = ADS_CMD,
		root_dir = ADS_ROOT_DIR,
	})

	local function get_pos()
		local cursor = vim.api.nvim_win_get_cursor(0)
		return { line=cursor[1], column=cursor[2], uri="file://" .. vim.fn.expand('%:p') }
	end

	local oldpos = nil
	local timer = uv.new_timer()
	timer:start(1000, 20, vim.schedule_wrap(function()
		local pos = get_pos()
		if oldpos == nil or pos.line ~= oldpos.line or pos.column ~= old_pos.column or pos.uri ~= old_pos.uri then
			old_pos = pos
			vim.lsp.buf.execute_command({
				command="position",
				arguments=pos
			})
		end
	end))

	vim.keymap.set('n', 'K', function()
		vim.lsp.buf.execute_command({command="entrypoint",arguments=get_pos()})
	end)

	vim.keymap.set('n', '<C-k>', function()
		vim.lsp.buf.execute_command({command="passes",arguments={delta=-1}})
	end)

	vim.keymap.set('n', '<C-l>', function()
		vim.lsp.buf.execute_command({command="passes",arguments={delta=1}})
	end)

	vim.keymap.set('n', '<C-q>', vim.lsp.buf.implementation)

	local function goto_hack(what, direction)
		vim.lsp.buf.execute_command({
			command="prepare_goto_hack",
			arguments={
				what=what,
				direction=direction,
			},
		})
		vim.lsp.buf.type_definition()
	end

	--[[
	BAD KEYS:
	 <C-a>  GNU Screen escape
	 <C-v>  Vim visual block mode
	]]
	vim.keymap.set('n', '<C-w>', function()
		goto_hack("step", 1)
	end)
	vim.keymap.set('n', '<C-s>', function()
		goto_hack("step", -1)
	end)
	vim.keymap.set('n', '<C-e>', function()
		print("TODO +1")
	end)
	vim.keymap.set('n', '<C-d>', function()
		print("TODO -1")
	end)
	vim.keymap.set('n', '<C-r>', function()
		print("TODO +2")
	end)
	vim.keymap.set('n', '<C-f>', function()
		print("TODO -2")
	end)
	vim.keymap.set('n', '<C-t>', function()
		print("TODO +3")
	end)
	vim.keymap.set('n', '<C-g>', function()
		print("TODO -3")
	end)
	vim.keymap.set('n', '<C-y>', function()
		print("TODO +4")
	end)
	vim.keymap.set('n', '<C-h>', function()
		print("TODO -4")
	end)

end

vim.cmd(":command! ADS :lua ADS()")

vim.filetype.add({
	extension = {
		["4st"] = "4st"
	}
})
