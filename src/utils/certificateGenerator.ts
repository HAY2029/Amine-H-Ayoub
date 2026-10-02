import { KidsProfile } from "../data/kidsProfile";
import { SURAHS } from "../data/quranData";
import { saveImageDataUrl } from "./tauriUtils";

function drawCanvasStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const size = i % 2 === 0 ? radius : radius * 0.42;
    const px = x + Math.cos(angle) * size;
    const py = y + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = encodeURI(src);
    setTimeout(() => resolve(null), 2500);
  });
}

export async function downloadStreakCertificate({
  studentName,
  avatarName,
  currentStreak = 0,
  longestStreak = 0,
  minutes = 0,
  coins = 0,
}: {
  studentName: string;
  avatarName?: string;
  currentStreak?: number;
  longestStreak?: number;
  minutes?: number;
  coins?: number;
}): Promise<void> {
  const canvas = document.createElement("canvas");
  const canvasW = 1080;
  const canvasH = 980;
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 1. تدرج الخلفية النارية الفاخرة (ثيم الحماس)
  const bg = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  bg.addColorStop(0, "#2C1204"); // بني محروق/أسود
  bg.addColorStop(0.5, "#4A1B02");
  bg.addColorStop(1, "#1A0A02");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // تأثير إضاءة برتقالية نارية في المنتصف
  const glow = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 100, canvasW / 2, canvasH / 2, 600);
  glow.addColorStop(0, "rgba(234, 88, 12, 0.25)");
  glow.addColorStop(1, "rgba(234, 88, 12, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // شبكة زخرفية
  ctx.strokeStyle = "rgba(251, 146, 60, 0.05)";
  ctx.lineWidth = 1.5;
  for (let x = 40; x < canvasW; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }
  for (let y = 40; y < canvasH; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }

  // 2. إطار ذهبي-برتقالي
  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, canvasW - 72, canvasH - 72);

  ctx.strokeStyle = "#EA580C";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(48, 48, canvasW - 96, canvasH - 96);

  const drawCorner = (cx: number, cy: number, flipX: number, flipY: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flipX, flipY);
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 48);
    ctx.quadraticCurveTo(8, 8, 48, 8);
    ctx.stroke();
    drawCanvasStar(ctx, 28, 28, 9, "#FCD34D");
    ctx.restore();
  };
  drawCorner(48, 48, 1, 1);
  drawCorner(canvasW - 48, 48, -1, 1);
  drawCorner(48, canvasH - 48, 1, -1);
  drawCorner(canvasW - 48, canvasH - 48, -1, -1);

  // 3. البسملة الشريفة
  ctx.fillStyle = "#FDE68A";
  ctx.font = "bold 30px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
  ctx.textAlign = "center";
  ctx.fillText("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", canvasW / 2, 98);

  // 4. شريط العنوان (ثيم ناري)
  const ribbonW = 740;
  const ribbonH = 76;
  const ribbonX = (canvasW - ribbonW) / 2;
  const ribbonY = 120;
  const ribbon = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonW, ribbonY + ribbonH);
  ribbon.addColorStop(0, "#7C2D12");
  ribbon.addColorStop(0.5, "#9A3412");
  ribbon.addColorStop(1, "#7C2D12");
  ctx.fillStyle = ribbon;
  ctx.beginPath();
  ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 26);
  ctx.fill();

  ctx.strokeStyle = "#FCD34D";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#FEF3C7";
  ctx.font = "bold 38px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
  ctx.fillText("شَهَادَةُ حَمَاسٍ وَهِمَّةٍ قُرْآنِيَّة", canvasW / 2, ribbonY + 52);

  // عبارة التكريم
  ctx.fillStyle = "#D1D5DB";
  ctx.font = "bold 25px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("تُمنح هذه الشهادة المتميزة تقديراً للالتزام اليومي الاستثنائي والمثابرة", canvasW / 2, 238);

  // 5. شخصية الطفل / الميدالية
  const avatarCenterY = 345;
  const avatarRadius = 82;

  const aura = ctx.createRadialGradient(canvasW / 2, avatarCenterY, avatarRadius - 10, canvasW / 2, avatarCenterY, avatarRadius + 40);
  aura.addColorStop(0, "rgba(249, 115, 22, 0.6)"); // برتقالي ساطع
  aura.addColorStop(1, "rgba(249, 115, 22, 0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(canvasW / 2, avatarCenterY, avatarRadius + 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(canvasW / 2, avatarCenterY, avatarRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  // تنظيف الاسم (إذا كان 'طفلي' يتم تغييره)
  const displayName = (!studentName || studentName === "طفلي" || studentName === "الطفل 1") ? "بطل القرآن الكريم" : studentName;

  try {
    // صور الأفاتار مضغوطة إلى .jpg (512px) — راجع scripts/compress-avatars.mjs
    const avatarImg =
      (await loadCanvasImage(`/avatars/${avatarName || "img-boy-1"}.jpg`)) ||
      (await loadCanvasImage(`/avatars/${avatarName || "boy1"}.png`));
    if (avatarImg && avatarImg.naturalWidth > 0) {
      ctx.drawImage(avatarImg, canvasW / 2 - avatarRadius, avatarCenterY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } else {
      drawCanvasStar(ctx, canvasW / 2, avatarCenterY, 48, "#F59E0B");
    }
  } catch {
    drawCanvasStar(ctx, canvasW / 2, avatarCenterY, 48, "#F59E0B");
  }
  ctx.restore();

  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(canvasW / 2, avatarCenterY, avatarRadius + 3, 0, Math.PI * 2);
  ctx.stroke();

  drawCanvasStar(ctx, canvasW / 2 - 120, avatarCenterY, 18, "#F59E0B");
  drawCanvasStar(ctx, canvasW / 2 + 120, avatarCenterY, 18, "#F59E0B");

  // 6. صفة واسم الطالب
  ctx.fillStyle = "#FCD34D";
  ctx.font = "bold 28px 'Traditional Arabic', 'Amiri', 'Cairo', serif";
  ctx.fillText("بَطَلُ التَّحَدِّي وَالْمُثَابَرَةِ", canvasW / 2, 458);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 52px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
  ctx.fillText(displayName, canvasW / 2, 510);

  ctx.fillStyle = "#9CA3AF";
  ctx.font = "bold 21px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("لمواظبته المستمرة على التلاوة وإثبات همته القرآنية العالية", canvasW / 2, 548);

  // 7. شبكة بطاقات الإحصائيات (2 × 2)
  const statCards = [
    { title: "أيام الحماس المتتالية", value: `${currentStreak || 0} يوم 🔥`, color: "#EA580C" },
    { title: "أطول سلسلة التزام", value: `${longestStreak || 0} يوم 🏆`, color: "#D97706" },
    { title: "مجموع دقائق التلاوة", value: `${minutes || 0} دقيقة ⏱️`, color: "#059669" },
    { title: "النجوم المكتسبة", value: `${coins.toLocaleString("en-US")} نجمة ⭐`, color: "#CA8A04" },
  ];

  const cardW = 430;
  const cardH = 92;
  const cardPositions = [
    { x: 95, y: 588, w: cardW, h: cardH },
    { x: 555, y: 588, w: cardW, h: cardH },
    { x: 95, y: 696, w: cardW, h: cardH },
    { x: 555, y: 696, w: cardW, h: cardH },
  ];

  statCards.forEach((st, idx) => {
    const pos = cardPositions[idx];
    ctx.fillStyle = "#1F2937";
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y, pos.w, pos.h, 20);
    ctx.fill();

    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = st.color;
    ctx.beginPath();
    ctx.arc(pos.x + pos.w - 46, pos.y + 46, 26, 0, Math.PI * 2); // نقلنا الأيقونة لليمين
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "24px 'Tahoma', 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    // استخراج الأيقونة من النص
    const icon = st.value.slice(-2);
    const textVal = st.value.slice(0, -2).trim();
    ctx.fillText(icon.trim(), pos.x + pos.w - 46, pos.y + 55);

    ctx.textAlign = "right";
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "bold 16px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText(st.title, pos.x + pos.w - 85, pos.y + 36);

    ctx.fillStyle = "#F3F4F6";
    ctx.font = "bold 26px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText(textVal, pos.x + pos.w - 85, pos.y + 72);
  });

  // 8. لوحة الحديث الشريف المحفز
  const hadithY = 812;
  const hadithW = 780;
  const hadithH = 78;
  const hadithX = (canvasW - hadithW) / 2;

  ctx.fillStyle = "rgba(17, 24, 39, 0.8)";
  ctx.beginPath();
  ctx.roundRect(hadithX, hadithY, hadithW, hadithH, 22);
  ctx.fill();
  ctx.strokeStyle = "#F59E0B";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  drawCanvasStar(ctx, hadithX + 32, hadithY + hadithH / 2, 11, "#FCD34D");
  drawCanvasStar(ctx, hadithX + hadithW - 32, hadithY + hadithH / 2, 11, "#FCD34D");

  ctx.textAlign = "center";
  ctx.fillStyle = "#FDE68A";
  ctx.font = "bold 29px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
  ctx.fillText("« أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ تَعَالَى أَدْوَمُهَا وَإِنْ قَلَّ »", canvasW / 2, hadithY + 41);

  ctx.fillStyle = "#9CA3AF";
  ctx.font = "bold 16px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("— قال رسول الله ﷺ —", canvasW / 2, hadithY + 66);

  // تحميل الشهادة
  const today = new Date();
  const safeName = displayName.replace(/\s+/g, "-");
  const filename = `شهادة-حماس-${safeName}-${today.toISOString().split("T")[0]}.png`;
  const dataUrl = canvas.toDataURL("image/png");

  await saveImageDataUrl(dataUrl, filename);
}
