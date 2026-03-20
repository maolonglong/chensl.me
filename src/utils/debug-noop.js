function noop() {
	return noop
}
noop.enable = noop
noop.disable = noop
noop.enabled = false
noop.destroy = noop
noop.log = noop
noop.extend = () => noop
noop.coerce = (v) => v
noop.formatters = {}
noop.names = []
noop.skips = []
export default noop
