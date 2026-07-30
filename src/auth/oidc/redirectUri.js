// Exact octet-for-octet string comparison, no normalization. See the plan's
// §5.2 for why: prefix matching, case-folding, or trailing-slash tolerance
// each create an unintended equivalence class that becomes an open redirect.
function isValidRedirectUri(candidate, registered) {
    if (typeof candidate !== 'string' || !Array.isArray(registered)) return false;
    return registered.includes(candidate);
}

module.exports = { isValidRedirectUri };
