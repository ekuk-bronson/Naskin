import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocale } from '../services/i18n';

interface CameraCaptureProps {
  onCapture: (uri: string) => void;
  onClose: () => void;
  onPickGallery?: () => void;
}

type DistanceState = 'far' | 'good' | 'close';

const DISTANCE_KEYS: Record<DistanceState, { color: string; key: string; bar: number }> = {
  far:   { color: '#FF9F0A', key: 'cam.distFar',   bar: 0.18 },
  good:  { color: '#30D158', key: 'cam.distGood',  bar: 0.55 },
  close: { color: '#FF453A', key: 'cam.distClose', bar: 0.90 },
};

// zoom 0–0.08 → far, 0.08–0.30 → good, >0.30 → close
function getDistanceState(zoom: number): DistanceState {
  if (zoom < 0.08) return 'far';
  if (zoom > 0.30) return 'close';
  return 'good';
}

const ZOOM_STEP = 0.05;

export function CameraCapture({ onCapture, onClose, onPickGallery }: CameraCaptureProps) {
  const { t } = useLocale();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [flash, setFlash] = useState(false);
  const [zoom, setZoom] = useState(0.15);
  const [distState, setDistState] = useState<DistanceState>('good');
  const [ready, setReady] = useState(false);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ringSize = Math.min(width * 0.58, 240);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse when distance is good
  useEffect(() => {
    if (distState === 'good') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.00, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [distState]);

  useEffect(() => {
    setDistState(getDistanceState(zoom));
  }, [zoom]);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permText}>{t('cam.permText')}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{t('cam.permBtn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const capture = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.92 });
      if (photo?.uri) onCapture(photo.uri);
    } catch {
      // unavailable in simulator
    }
  };

  const adjustZoom = (delta: number) => {
    setZoom((prev) => Math.min(0.6, Math.max(0, +(prev + delta).toFixed(3))));
  };

  const cfg = DISTANCE_KEYS[distState];
  const ringColor = ready ? cfg.color : 'rgba(255,255,255,0.3)';
  const distLabel = ready ? t(cfg.key) : t('cam.distPrep');

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        flash={flash ? 'on' : 'off'}
        zoom={zoom}
        onCameraReady={() => setReady(true)}
      />

      {/* Dark overlay (corners only) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.overlayTop} />
        <View style={styles.overlayBottom} />
        <View style={styles.overlayLeft} />
        <View style={styles.overlayRight} />
      </View>

      {/* ── Back button ─────────────────────────────── */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 }]} onPress={onClose}>
        <Text style={styles.backBtnText}>←</Text>
      </TouchableOpacity>

      {/* ── Distance badge (top right) ──────────────── */}
      <View style={[styles.distanceBadge, { top: insets.top + 10 }]}>
        <View style={[styles.distanceDot, { backgroundColor: ringColor }]} />
        <Text style={[styles.distanceLabel, { color: ringColor }]}>{distLabel}</Text>
      </View>

      {/* ── Centre ring ─────────────────────────────── */}
      <View style={styles.center} pointerEvents="none">
        <Animated.View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderColor: ringColor,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
        <View style={styles.crossH} />
        <View style={styles.crossV} />
      </View>

      {/* ── Distance meter + zoom buttons (right side) ─ */}
      <View style={[styles.sidePanel, { top: insets.top + 70, bottom: 160 + insets.bottom }]}>
        {/* Zoom in = приблизить объект = уменьшить zoom (нужно меньше zoom чтобы смотреть с нужного расстояния) */}
        <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(-ZOOM_STEP)}>
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>

        {/* Meter track */}
        <View style={styles.meterWrap}>
          <Text style={styles.meterLabelTop}>{t('cam.distFar')}</Text>
          <View style={styles.meterTrack}>
            <View style={[styles.meterZone, { flex: 1, backgroundColor: 'rgba(255,159,10,0.4)' }]} />
            <View style={[styles.meterZone, { flex: 1.4, backgroundColor: 'rgba(48,209,88,0.4)' }]} />
            <View style={[styles.meterZone, { flex: 1, backgroundColor: 'rgba(255,69,58,0.4)' }]} />
            <View
              style={[
                styles.meterIndicator,
                { top: `${cfg.bar * 100}%` as any, backgroundColor: ringColor },
              ]}
            />
          </View>
          <Text style={styles.meterLabelBot}>{t('cam.distClose')}</Text>
        </View>

        <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(ZOOM_STEP)}>
          <Text style={styles.zoomBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* ── Bottom controls ─────────────────────────── */}
      <View style={[styles.controls, { bottom: Math.max(insets.bottom + 16, 40) }]}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => { onClose(); onPickGallery?.(); }}>
          <Text style={styles.sideBtnIcon}>🖼</Text>
          <Text style={styles.sideBtnLabel}>{t('cam.gallery')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shutterOuter, { borderColor: ringColor }]}
          onPress={capture}
          activeOpacity={0.8}
        >
          <View style={[styles.shutterInner, { backgroundColor: ringColor }]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sideBtn, flash && styles.sideBtnActive]}
          onPress={() => setFlash((f) => !f)}
        >
          <Text style={styles.sideBtnIcon}>⚡</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  // Overlay corners
  overlayTop:     { position: 'absolute', top: 0, left: 0, right: 0, height: '20%', backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayBottom:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayLeft:    { position: 'absolute', top: '20%', bottom: '20%', left: 0, width: '21%', backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayRight:   { position: 'absolute', top: '20%', bottom: '20%', right: 0, width: '21%', backgroundColor: 'rgba(0,0,0,0.5)' },
  // Back button
  backBtn:        { position: 'absolute', left: 18, width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  backBtnText:    { color: '#fff', fontSize: 16 },
  // Distance badge
  distanceBadge:  { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 22, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, paddingVertical: 8, zIndex: 10 },
  distanceDot:    { width: 8, height: 8, borderRadius: 99 },
  distanceLabel:  { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  // Aim ring
  center:         { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ring:           { position: 'absolute', borderWidth: 2.5 },
  crossH:         { position: 'absolute', width: 16, height: 1.5, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 99 },
  crossV:         { position: 'absolute', width: 1.5, height: 16, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 99 },
  // Side panel
  sidePanel:      { position: 'absolute', right: 14, alignItems: 'center', justifyContent: 'space-between', zIndex: 10, gap: 6 },
  zoomBtn:        { width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  zoomBtnText:    { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  // Distance meter
  meterWrap:      { flex: 1, alignItems: 'center', gap: 4 },
  meterLabelTop:  { fontSize: 8, color: 'rgba(255,255,255,0.4)' },
  meterLabelBot:  { fontSize: 8, color: 'rgba(255,255,255,0.4)' },
  meterCm:        { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.2, marginTop: 2 },
  meterTrack:     { flex: 1, width: 10, borderRadius: 99, overflow: 'hidden', position: 'relative', gap: 1 },
  meterZone:      { width: '100%', borderRadius: 2 },
  meterIndicator: { position: 'absolute', left: -4, width: 18, height: 18, borderRadius: 99, marginTop: -9, borderWidth: 2.5, borderColor: '#fff', elevation: 4 },
  // Bottom controls
  controls:       { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 32, zIndex: 10 },
  sideBtn:        { width: 46, height: 46, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  sideBtnActive:  { borderColor: 'rgba(255,255,255,0.7)' },
  sideBtnIcon:    { fontSize: 20 },
  sideBtnLabel:   { fontSize: 8, color: 'rgba(255,255,255,0.55)', fontWeight: '600', letterSpacing: 0.3, marginTop: 2 },
  shutterOuter:   { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  shutterInner:   { width: 54, height: 54, borderRadius: 27, opacity: 0.9 },
  // Permissions
  permText:       { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 16 },
  permBtn:        { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  permBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },
});
