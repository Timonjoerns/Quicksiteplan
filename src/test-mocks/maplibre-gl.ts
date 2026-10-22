// Minimal maplibre-gl mock for tests. jsdom has no WebGL/canvas support,
// and the real library throws on import in that environment, so we stub
// just the surface MapView.tsx touches.
class MockMap {
  private listeners: Record<string, Array<() => void>> = {};

  on(event: string, cb: () => void) {
    (this.listeners[event] ||= []).push(cb);
    return this;
  }
  off(event: string, cb: () => void) {
    this.listeners[event] = (this.listeners[event] || []).filter(fn => fn !== cb);
    return this;
  }
  once(event: string, cb: () => void) {
    cb();
    return this;
  }
  isStyleLoaded() {
    return true;
  }
  getCenter() {
    return { lng: 0, lat: 0 };
  }
  getSource() {
    return undefined;
  }
  getLayer() {
    return undefined;
  }
  addSource() {}
  addLayer() {}
  removeLayer() {}
  removeSource() {}
  remove() {}
}

export default { Map: MockMap };
export const Map = MockMap;
