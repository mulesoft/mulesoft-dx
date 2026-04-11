# Static API Portal Generator

A Python-based generator that creates a fully static API documentation portal from OpenAPI 3.0 specifications and skills.

## Features

✅ **100% Static** - No backend server, no build tools, no runtime needed
✅ **Offline Ready** - Just double-click `portal/index.html` to open
✅ **Modern UI** - Responsive design with dark mode support
✅ **Skills Integration** - Prominently displays workflows and JTBDs
✅ **Fast** - Generates entire portal in ~5 seconds
✅ **Easy Deploy** - Copy to GitHub Pages, Netlify, S3, or any static host

## Quick Start

### Generate Portal

```bash
# Using Make
make generate-portal

# Or directly with Python
python3 scripts/generate_portal.py --output portal
```

### View Portal

**Just open the file!** No server needed:

```bash
# macOS
open portal/index.html

# Windows
start portal/index.html

# Linux
xdg-open portal/index.html
```

## What Gets Generated

```
portal/
├── index.html                  # Homepage with API catalog
├── apis/
│   ├── api-manager.html       # 31 individual API pages
│   ├── access-management.html
│   └── ...
├── assets/
│   ├── styles.css             # ~14KB CSS
│   └── portal.js              # ~2.4KB JavaScript
```

## Portal Features

### Homepage
- **Statistics Bar**: API count, endpoint count, skills count
- **Category Filtering**: Filter APIs by category (API Management, Runtime, Security, etc.)
- **API Cards**: Name, version, description, endpoint count, skills badge
- **Skills Section**: List of all 8 skills with descriptions

### API Detail Pages
- **API Header**: Title, version, description, base URL, operation count
- **Skills Section**: Expandable skill cards with step-by-step workflows
- **Operations List**: All operations with method badges, paths, descriptions
- **Search**: Client-side filtering of operations
- **Back Navigation**: Return to homepage

### Interactive Features
- ✅ Filter APIs by category (no page reload)
- ✅ Search operations by keyword
- ✅ Expandable skill workflows
- ✅ Smooth scrolling to sections
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Dark mode (automatic based on system preference)

## How It Works

### 1. Discovery Phase
- Scans all API directories for `api.yaml` files
- Parses OpenAPI 3.0 specifications
- Discovers skills in the top-level `skills/*/SKILL.md` directory
- Calculates statistics

### 2. Generation Phase
- Renders homepage with all APIs and skills
- Generates individual detail page for each API
- Creates CSS with modern styling
- Creates JavaScript for interactivity

### 3. Output Phase
- Writes all HTML files to `portal/`
- Includes inline CSS and JavaScript
- Works offline via `file://` protocol

## Dependencies

```txt
ruamel.yaml>=0.17.0        # Streaming YAML parser
python-frontmatter>=1.0    # Parse skill frontmatter
```

Install with:
```bash
pip install ruamel.yaml python-frontmatter
```

## Configuration

The generator automatically:
- Discovers all APIs in the repository
- Categorizes APIs based on name mapping
- Parses skills from `skills/*/SKILL.md`
- Generates responsive, modern UI

### Category Mapping

APIs are auto-categorized:

| Category | APIs |
|----------|------|
| API Management | api-manager, api-platform |
| Runtime | cloudhub, cloudhub-20, runtime-fabric |
| Security | secrets-manager, anypoint-security-policies, tokenization-* |
| Monitoring | metrics, arm-monitoring-query, analytics-event-export |
| Access & Identity | access-management |
| Gateway | flex-gateway-manager, proxies-xapi |
| Messaging | anypoint-mq-* |
| Storage | object-store-v2* |
| And more... | See `CATEGORY_MAPPING` in script |

## CLI Options

```bash
python3 scripts/generate_portal.py [OPTIONS]

Options:
  --output, -o    Output directory (default: portal)
  --repo, -r      Repository root (default: current directory)
```

## Deployment

### GitHub Pages

```bash
# Generate portal
make generate-portal

# Create gh-pages branch
cd portal
git init
git add -A
git commit -m "Deploy API portal"
git push -f git@github.com:your-org/your-repo.git main:gh-pages
```

### Netlify

1. Connect your repository
2. Set build command: `make generate-portal`
3. Set publish directory: `portal`
4. Deploy!

### AWS S3

```bash
# Generate portal
make generate-portal

# Sync to S3
aws s3 sync ./portal s3://your-bucket-name --delete

# Optional: Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### Simple Zip

```bash
# Generate portal
make generate-portal

# Create zip
cd portal
zip -r ../api-portal.zip .
cd ..

# Send api-portal.zip to anyone - they just unzip and open index.html!
```

## File Sizes

| Component | Size | Notes |
|-----------|------|-------|
| index.html | ~30KB | Homepage with all APIs |
| styles.css | ~14KB | Modern CSS (~4KB gzipped) |
| portal.js | ~2.4KB | Minimal JavaScript (~1KB gzipped) |
| API pages | Varies | 3KB (metrics) to 155KB (access-management) |
| **Total** | ~1.2MB | All 31 APIs + assets |

## Performance

- **Generation Time**: ~5 seconds for all 31 APIs
- **Page Load Time**: <500ms for homepage (file://)
- **Detail Page Load**: <1s even for largest API (access-management, 267 ops)
- **Filtering**: Instant (client-side JavaScript)
- **Search**: Instant (client-side JavaScript)

## Browser Support

Works in all modern browsers:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Troubleshooting

### Portal doesn't open
- **Make sure you're opening `portal/index.html`** (not `index.html` from root)
- Try a different browser
- Check browser console for errors (F12)

### Skills don't show
- Verify skills exist in `skills/*/SKILL.md`
- Regenerate portal: `make generate-portal`
- Check skill frontmatter format (name, description fields)

### Filtering doesn't work
- JavaScript may be disabled in browser
- Check browser console for errors
- Portal works without JS (just no filtering)

### API detail pages are blank
- Check that API has valid `api.yaml` file
- Verify OpenAPI 3.0 format
- Regenerate portal: `make generate-portal`

## Development

### Project Structure

```
scripts/
└── generate_portal.py          # Main generator script
    ├── OAS Parser              # Parse api.yaml files
    ├── Skill Parser            # Parse SKILL.md files
    ├── Homepage Generator      # Build index.html
    ├── Detail Page Generator   # Build API pages
    ├── CSS Generator           # Create styles.css
    └── JS Generator            # Create portal.js
```

### Adding New Features

**To add a new section:**

1. Create a render method in `PortalGenerator` class
2. Call it from `generate_homepage()` or `generate_api_page()`
3. Add corresponding CSS styles in `generate_css()`

**To modify styling:**

1. Edit CSS in `generate_css()` method
2. Use CSS variables for colors/spacing
3. Regenerate: `make generate-portal`

**To add interactivity:**

1. Add JavaScript in `generate_js()` method
2. Set up event listeners in `DOMContentLoaded`
3. Regenerate: `make generate-portal`

## Examples

### Filter APIs by Category

1. Open `portal/index.html`
2. Click category button (e.g., "Security")
3. Only APIs in that category are shown

### Search Operations

1. Open any API detail page (e.g., `portal/apis/api-manager.html`)
2. Type in search box (e.g., "policy")
3. Operations matching query are shown

### View Skill Workflow

1. Open `portal/apis/api-manager.html`
2. Scroll to "Skills & Workflows" section
3. Click "View Workflow Steps" on any skill card
4. Steps expand inline

## Future Enhancements

Potential additions (not in current version):

- [ ] Full-text search across all APIs and operations
- [ ] Interactive "Try It Out" console with OAuth2
- [ ] Export to Postman/Insomnia collections
- [ ] API changelog/diff viewer
- [ ] Skill execution wizard
- [ ] Analytics tracking

## Support

For issues or questions:
1. Check this README
2. Review generator output for errors
3. Inspect browser console (F12)
4. Regenerate portal: `make generate-portal`

## License

Part of the api-notebook-anypoint-specs repository.

---

**Status**: ✅ Production Ready
**Version**: 1.0
**Last Updated**: 2026-03-26
