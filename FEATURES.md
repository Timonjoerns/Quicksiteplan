# Kontext Features

## Current Features

### ✅ OSM Data Layers
- **Water Bodies** - Rivers, lakes, waterways (blue)
- **Streets** - All highway types (orange)
- **Buildings** - Building outlines (gray)
- **Railways** - Rail lines with dashed pattern (dark gray)
- **Trees** - Individual tree points (green circles)
- **Green Areas** - All green spaces including:
  - Forests (`landuse=forest`, `natural=wood`)
  - Parks (`leisure=park`)
  - Gardens (`leisure=garden`)
  - Meadows (`landuse=meadow`)
  - Grass areas (`landuse=grass`, `natural=grassland`)
  - Orchards (`landuse=orchard`)
  - Vineyards (`landuse=vineyard`)
  - Farmland (`landuse=farmland`)
  - Allotments (`landuse=allotments`)
  - Nature reserves (`leisure=nature_reserve`)
  - Scrubland (`natural=scrub`)
  - Heathland (`natural=heath`)

### 🗺️ Map Features
- Interactive map viewer with MapLibre GL
- Bounding box (bbox) selection for export area
- Center marker for map navigation
- Export frame visualization (red dashed rectangle)
- Floating action buttons for:
  - Fetch OSM Data
  - Center BBox on current view

### 📄 PDF Export
- **Paper Sizes**: A0, A1, A2, A3, A4
- **Orientations**: Portrait, Landscape
- **Custom Scale**: Adjustable scale (e.g., 1:5000)
- **Vector Export**: All features exported as vector graphics
- **North Arrow**: Automatic north indicator
- **Scale Bar**: Dynamic scale bar with metric measurements
- **Feature Rendering**:
  - Green areas: Filled light green polygons with dark green outline
  - Trees: Small filled circles in forest green
  - Water: Blue lines
  - Streets: Orange lines
  - Buildings: Gray lines
  - Railways: Dashed dark gray lines

### 🎨 UI/UX
- Swiss-style glassmorphism design
- Collapsible sidebar with sections:
  - Features selection (checkboxes)
  - Export options (scale, paper size, orientation)
- Loading states and error handling
- Responsive backdrop blur effects
- Clean, modern interface

### 🔧 Technical
- React 19 + TypeScript
- MapLibre GL for mapping
- jsPDF for PDF generation
- Proj4 for coordinate projections (Web Mercator)
- Axios for Overpass API requests
- Safari compatibility optimizations

## Color Scheme

| Feature | Map Color | PDF Color | Style |
|---------|-----------|-----------|-------|
| Green Areas | Light green fill (#90EE90, 40% opacity) + Forest green outline (#228B22) | Light green (#90EE90) | Filled polygon |
| Trees | Forest green circles (#228B22) | Forest green (#228B22) | Filled circles (0.8 radius) |
| Water | Blue (#3399FF) | Blue (51, 153, 255) | Lines |
| Streets | Orange (#FF6600) | Orange (255, 102, 0) | Lines |
| Buildings | Gray (#888888) | Gray (136, 136, 136) | Lines |
| Railways | Dark gray (#444) | - | Dashed lines |

## Data Source
- OpenStreetMap via Overpass API (https://overpass.kumi.systems)
- Real-time data fetching based on selected bounding box
- Customizable feature type selection

## Browser Support
- ✅ Chrome/Edge (Chromium)
- ✅ Safari (with specific compatibility fixes)
- ✅ Firefox
- ✅ Other modern browsers

## Usage

1. **Navigate** - Pan and zoom the map to your area of interest
2. **Select Features** - Choose which OSM layers to display (water, streets, buildings, railways, trees, green areas)
3. **Position BBox** - Use "Center BBox Here" button to position the export frame
4. **Configure Export** - Set scale, paper size, and orientation
5. **Fetch Data** - Click download icon to fetch OSM data for the bbox
6. **Export** - Click "Export as PDF" to generate your site plan

## Technical Notes

### Overpass Query
The app uses optimized Overpass QL queries to fetch:
- Ways with specific tags (buildings, streets, green areas, etc.)
- Nodes with tags (individual trees)
- Proper bbox formatting: `(south, west, north, east)`

### Projection System
- Display: WGS84 (EPSG:4326)
- Export: Web Mercator (EPSG:3857) for accurate metric scaling
- PDF coordinates calculated based on paper size and scale

### Performance
- Timeout: 25 seconds for Overpass queries
- Efficient GeoJSON conversion
- Layer-based rendering for optimal performance
- Conditional feature loading based on selection
