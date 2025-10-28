# eBay Total Cost Display

A Chrome extension that automatically calculates and displays the total cost (price + shipping) for eBay listings, making it easier to compare the true cost of items.

> **Note**: New August 2025 layout fix by: [dpill83](https://github.com/dpill83)

## Features

- **Automatic Total Calculation**: Displays the total cost (price + shipping) for each eBay listing
- **Multi-Layout Support**: Works with various eBay page layouts including search results, item cards, and pricing research modals
- **Global eBay Support**: Compatible with all eBay international sites (.com, .co.uk, .de, .ca, etc.)
- **Real-time Updates**: Automatically detects and processes new content as you browse
- **Smart Detection**: Uses multiple selectors to find price and shipping information across different eBay layouts
- **Duplicate Prevention**: Prevents multiple total cost displays on the same item
- **Debug Mode**: Optional debug logging for troubleshooting

## Installation

This extension is updated for Manifest V3 and can be installed as an unpacked extension:

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder

## Usage

Once installed, the extension automatically works on eBay pages. You'll see total costs displayed next to item prices in the format: `(Total Cost: $X.XX)`

### Debug Mode

To enable debug logging for troubleshooting:
1. Open browser console (F12)
2. Run: `localStorage.setItem('ebtc_debug','1')`
3. Refresh the page to see detailed logging

## Technical Details

- **Manifest Version**: 3
- **Content Scripts**: Runs on all eBay domains
- **Dependencies**: jQuery 3.7.1, jQuery UI, jQuery dotimeout
- **Injection Strategy**: Uses MutationObserver to detect dynamic content changes
- **Processing**: Multiple passes with 500ms intervals to ensure all items are processed

## Supported eBay Layouts

- Standard search results (`.s-item`, `.sresult`)
- New card layouts (`.s-card`)
- Pricing research modals (`.cim-results-rows-view__row`)
- Test ID based layouts (`[data-testid*="listing"]`)
- Legacy layouts (`.listing-item`, `.item-row`)

## Changelog

#### 2.0.4 — 2025-10-17
- Enhanced support for pricing research modals
- Improved text-based price and shipping detection
- Better handling of attribute rows in card layouts
- Periodic checks for unprocessed items
- More robust error handling and logging

#### 2.0.1 — 2025-08-10
- Fix: Total Cost now displays reliably on new eBay `s-card` layouts (broadened selectors and smarter insertion points).
- Fix: Prevent duplicate injections with an `ebtc-processed` marker and stricter checks.
- Fix: More robust number parsing; safer handling when price/shipping text is missing.
- Change: Inject as `span.ebay-total-cost` and improved styling to ensure visibility.
- Dev: Debug logging disabled by default; toggle with `localStorage.setItem('ebtc_debug','1')`.

## Credits & Original Work

**New Fix by**: [dpill83](https://github.com/dpill83)
**Original Extension**: [Chrome Web Store listing](https://chromewebstore.google.com/detail/ebay-total-cost-display/heneliofimmlbokhbapdppelcohehpam)  
