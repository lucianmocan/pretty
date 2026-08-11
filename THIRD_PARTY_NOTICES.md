# Third-party notices

Pretty's own source code is licensed under the GNU General Public License,
version 3. Third-party components remain under their respective licenses.

## MuPDF.js

Pretty's PDF page-import feature uses the published `mupdf` npm package,
version 1.28.0, without modifications to the MuPDF package itself.

- Project: [MuPDF](https://mupdf.com/)
- Copyright: Artifex Software, Inc. and MuPDF contributors
- License: GNU Affero General Public License, version 3 or later
- License text: [LICENSES/AGPL-3.0.txt](./LICENSES/AGPL-3.0.txt)
- Upstream source: [MuPDF releases](https://mupdf.com/releases/)

The corresponding source for the Pretty application that incorporates this
package is available in the [Pretty source repository](https://github.com/lucianmocan/scripture).

MuPDF is used client-side to read user-selected PDFs and convert selected
pages to SVG images. Pretty does not modify PDFs with MuPDF. PDFs exported by
Pretty are created separately with `pdf-lib`, so Pretty does not identify
MuPDF as the producer of those exported files.

MuPDF is provided without warranty under the terms of the GNU Affero General
Public License. See the included license text for the complete terms.

## IMG.LY background-removal-js

Pretty's client-side background-removal feature uses the published
`@imgly/background-removal` npm package, version 1.7.0, without modifications
to that package.

- Project: [background-removal-js](https://github.com/imgly/background-removal-js)
- Copyright: IMG.LY GmbH and contributors
- License: GNU Affero General Public License, version 3
- License text: [LICENSES/AGPL-3.0.txt](./LICENSES/AGPL-3.0.txt)
- Upstream source: [IMG.LY background-removal-js releases](https://github.com/imgly/background-removal-js/releases)

Background removal runs in the user's browser. The image being processed is
not uploaded to IMG.LY; the package downloads its model and WebAssembly assets
on first use and caches them in the browser.

The package is provided without warranty under the terms of the GNU Affero
General Public License. See the included license text for the complete terms.
