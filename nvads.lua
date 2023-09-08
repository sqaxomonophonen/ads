uv = require("luv")
function ADS()
	vim.lsp.start({
		name = 'hack4st',
		cmd = ADS_CMD,
		root_dir = ADS_ROOT_DIR,
	})


	local line = 0
	local column = 0
	local timer = uv.new_timer()
	timer:start(1000, 50, vim.schedule_wrap(function()
		local cursor = vim.api.nvim_win_get_cursor(0)
		if cursor[1] ~= line or cursor[2] ~= column then
			line = cursor[1]
			column = cursor[2]
			vim.lsp.buf.execute_command({command="cursor",arguments={c={line,column}}})
		end
	end))
end
vim.cmd(":command! ADS :lua ADS()")
