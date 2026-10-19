'use client';

import 'leaflet/dist/leaflet.css';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';
import type { PlanView } from '@/ga/fitness';
import { dayColor } from '@/lib/utils';

type Leaflet = typeof import('leaflet');

/** Leaflet modul CommonJS: bundler bisa mengembalikannya sebagai `default` atau langsung. */
const loadLeaflet = (): Promise<Leaflet> =>
  import('leaflet').then((mod) => (mod as unknown as { default?: Leaflet }).default ?? mod);

/** Menggambar penanda bernomor (warna per hari) dan garis rute berurutan. */
function drawRoute(L: Leaflet, map: LeafletMap, group: LayerGroup, plan: PlanView) {
  group.clearLayers();
  const stops = plan.days.flatMap((d) => d.stops.map((s) => ({ ...s, day: d.day })));
  if (stops.length === 0) return;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (!a || !b) continue;
    L.polyline(
      [
        [a.lat, a.lng],
        [b.lat, b.lng],
      ],
      { color: dayColor(b.day), weight: 3, opacity: 0.8, dashArray: a.day !== b.day ? '6 6' : undefined },
    ).addTo(group);
  }
  stops.forEach((s, i) => {
    const icon = L.divIcon({
      className: '',
      html: `<div class="route-marker" style="width:24px;height:24px;background:${dayColor(s.day)}">${i + 1}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([s.lat, s.lng], { icon, title: s.name })
      .bindPopup(`<b>${i + 1}. ${s.name}</b><br/>Hari ${s.day} · ${s.visitHours} jam kunjungan`)
      .addTo(group);
  });
  // Ukuran kontainer bisa berubah setelah render (dynamic import, grid), jadi ukur ulang dulu.
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
}

/** Peta rute berurutan (Leaflet + OpenStreetMap). */
export function RouteMap({ plan, height = 380 }: { plan: PlanView; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const latestPlan = useRef(plan);

  useEffect(() => {
    latestPlan.current = plan;
    if (map.current && layer.current) {
      const [m, g] = [map.current, layer.current];
      void loadLeaflet().then((L) => drawRoute(L, m, g, plan));
    }
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    let created: LeafletMap | null = null;
    void loadLeaflet().then((L) => {
      if (cancelled || !el.current) return;
      created = L.map(el.current, { scrollWheelZoom: false }).setView([-6.2, 106.83], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; kontributor <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(created);
      const group = L.layerGroup().addTo(created);
      map.current = created;
      layer.current = group;
      drawRoute(L, created, group, latestPlan.current);
    });
    return () => {
      cancelled = true;
      created?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  return <div ref={el} className="z-0 w-full overflow-hidden rounded-lg border" style={{ height }} />;
}
