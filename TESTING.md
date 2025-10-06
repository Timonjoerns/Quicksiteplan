# Testing Guide for Trees & Green Areas

## Fixes Applied ✅

### 1. **Map Layer Cleanup Issue** 
**Problem**: "Source 'osm-greenery' already exists" error
**Solution**: 
- Fixed removal order: layers must be removed BEFORE sources
- Added proper style loaded check
- Separated layer IDs and source IDs for clarity

### 2. **Overpass Query Syntax Error**
**Problem**: Greenery query had incorrect syntax with union block
**Solution**:
- Removed trailing semicolon from union block
- Fixed bbox application to each sub-query in the union
- Query now properly fetches all green area types

## How to Test

### Step 1: Navigate to a Green Area
Try these locations with lots of greenery:

1. **Berlin Tiergarten** (large park)
   - Lat: 52.5145, Lng: 13.3501
   
2. **Central Park, New York**
   - Lat: 40.7829, Lng: -73.9654

3. **Hyde Park, London**
   - Lat: 51.5074, Lng: -0.1657

### Step 2: Select Features
In the sidebar, make sure these are checked:
- ✅ Trees (Points)
- ✅ Green Areas

### Step 3: Fetch Data
1. Position the red bbox rectangle over the area
2. Click the **download icon** (floating button bottom-right)
3. Wait for "Loading OSM data..." to complete

### Expected Results:
- **No console errors** about duplicate sources
- **Green areas** appear as light green filled polygons
- **Individual trees** appear as small green dots
- **Console log** shows the Overpass query (check it's valid)

### Step 4: Test PDF Export
1. Set scale (e.g., 5000)
2. Choose paper size (e.g., A4)
3. Click "Export as PDF"

**Expected in PDF:**
- Green areas rendered as filled light green polygons
- Trees rendered as small filled circles
- Scale bar and north arrow present
- All selected features visible

## Debug Console

Open browser console (F12) and check:

### Successful Overpass Query Should Look Like:
```
[out:json][timeout:25];
(
way["natural"="water"](52.51,13.37,52.52,13.40);
way["highway"](52.51,13.37,52.52,13.40);
way["building"](52.51,13.37,52.52,13.40);
node["natural"="tree"](52.51,13.37,52.52,13.40);
way["landuse"="forest"](52.51,13.37,52.52,13.40);way["landuse"="grass"](52.51,13.37,52.52,13.40);...
);
out body;>;
out skel qt;
```

### Check Network Tab:
- Request to `https://overpass.kumi.systems/api/interpreter`
- Status: 200 OK
- Response contains `"elements":[...]` with nodes and ways

## Known Issues

### If you still see errors:

1. **"Source already exists"**
   - Refresh the page (Cmd+R / Ctrl+R)
   - This happens if layers weren't cleaned up from previous session

2. **No data showing**
   - Check the area has OSM data (try Berlin first)
   - Increase timeout if needed (currently 25s)
   - Check console for Overpass errors

3. **Query timeout**
   - Reduce bbox size (smaller area)
   - Uncheck some feature types
   - Try different Overpass server

## Feature Colors Reference

| Feature | Map Display | PDF Export |
|---------|-------------|------------|
| Green Areas | Light green fill + forest green outline | Light green fill |
| Trees | Forest green circles with white stroke | Small filled circles |
| Water | Blue lines | Blue lines |
| Streets | Orange lines | Orange lines |
| Buildings | Gray lines | Gray lines |

## Performance Tips

- **Start with a small bbox** - Testing in a small park area first
- **Don't select all features** in very dense areas
- **Wait for map to load** before fetching OSM data
- **One fetch at a time** - Let previous request complete

## Success Indicators ✅

You know it's working when:
- ✅ No console errors after clicking fetch
- ✅ Green areas appear filled on map
- ✅ Individual trees appear as dots
- ✅ PDF contains all selected features
- ✅ Can toggle features on/off without errors
- ✅ Multiple fetches work without page refresh
