// Licenses an animation can carry. `remix` must match LICENSE_REMIX in community/src/config.js (a test checks it).
// remix: others may publish modified versions · commercial: may be used commercially · credit: the author must
// be credited · same: remixes must keep the same license. Names of real licenses are not translated.
(function () {
    'use strict';

    const cc = (name, path, flags) => ({ group: 'cc', name, url: `https://creativecommons.org/${path}`, ...flags });
    const sw = (name, slug, flags) => ({ group: 'software', name, url: `https://choosealicense.com/licenses/${slug}/`, ...flags });
    const PERMISSIVE = { remix: true, commercial: true, credit: true, same: false };
    const COPYLEFT = { remix: true, commercial: true, credit: true, same: true };

    const LICENSES = {
        'cc-by-4.0': cc('CC BY 4.0', 'licenses/by/4.0/', PERMISSIVE),
        'cc-by-sa-4.0': cc('CC BY-SA 4.0', 'licenses/by-sa/4.0/', COPYLEFT),
        'cc-by-nc-4.0': cc('CC BY-NC 4.0', 'licenses/by-nc/4.0/', { remix: true, commercial: false, credit: true, same: false }),
        'cc-by-nc-sa-4.0': cc('CC BY-NC-SA 4.0', 'licenses/by-nc-sa/4.0/', { remix: true, commercial: false, credit: true, same: true }),
        'cc-by-nd-4.0': cc('CC BY-ND 4.0', 'licenses/by-nd/4.0/', { remix: false, commercial: true, credit: true, same: false }),
        'cc-by-nc-nd-4.0': cc('CC BY-NC-ND 4.0', 'licenses/by-nc-nd/4.0/', { remix: false, commercial: false, credit: true, same: false }),
        'cc0-1.0': cc('CC0 1.0', 'publicdomain/zero/1.0/', { remix: true, commercial: true, credit: false, same: false }),
        mit: sw('MIT License', 'mit', PERMISSIVE),
        'apache-2.0': sw('Apache License 2.0', 'apache-2.0', PERMISSIVE),
        'gpl-3.0': sw('GNU GPL v3.0', 'gpl-3.0', COPYLEFT),
        'gpl-2.0': sw('GNU GPL v2.0', 'gpl-2.0', COPYLEFT),
        'agpl-3.0': sw('GNU AGPL v3.0', 'agpl-3.0', COPYLEFT),
        'lgpl-3.0': sw('GNU LGPL v3.0', 'lgpl-3.0', COPYLEFT),
        'lgpl-2.1': sw('GNU LGPL v2.1', 'lgpl-2.1', COPYLEFT),
        'mpl-2.0': sw('Mozilla Public License 2.0', 'mpl-2.0', COPYLEFT),
        'epl-2.0': sw('Eclipse Public License 2.0', 'epl-2.0', COPYLEFT),
        'bsd-2-clause': sw('BSD 2-Clause License', 'bsd-2-clause', PERMISSIVE),
        'bsd-3-clause': sw('BSD 3-Clause License', 'bsd-3-clause', PERMISSIVE),
        'bsl-1.0': sw('Boost Software License 1.0', 'bsl-1.0', PERMISSIVE),
        unlicense: sw('The Unlicense', 'unlicense', { remix: true, commercial: true, credit: false, same: false }),
        'all-rights-reserved': { group: 'other', name: null, url: null, remix: false, commercial: false, credit: null, same: false },
        custom: { group: 'other', name: null, url: null, remix: null, commercial: null, credit: null, same: false },
    };

    window.BASCommunityLicenses = Object.freeze({ list: Object.freeze(LICENSES), groups: Object.freeze(['cc', 'software', 'other']) });
})();
