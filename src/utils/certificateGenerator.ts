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

export async function downloadLegendaryCertificate({
  studentName,
  avatarName,
  totalAyahs = 0,
  surahsCompleted = 0,
  coins = 0,
  streakDays = 0,
}: {
  studentName: string;
  avatarName?: string;
  totalAyahs?: number;
  surahsCompleted?: number;
  coins?: number;
  streakDays?: number;
}): Promise<void> {
  const canvas = document.createElement("canvas");
  const canvasW = 1080;
  const canvasH = 980;
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 1. تدرج الخلفية الملكية العاجية
  const bg = ctx.createLinearGradient(0, 0, 0, canvasH);
  bg.addColorStop(0, "#FFF9EB"); // amber-50
  bg.addColorStop(0.5, "#FFFFFF"); // white
  bg.addColorStop(1, "#FFF8E7"); // amber-50
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // إضاءة خفيفة
  const glow = ctx.createRadialGradient(canvasW / 2, canvasH / 2, 100, canvasW / 2, canvasH / 2, 800);
  glow.addColorStop(0, "rgba(245, 158, 11, 0.05)");
  glow.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // شبكة زخرفية إسلامية رقيقة في الخلفية
  ctx.strokeStyle = "rgba(245, 158, 11, 0.06)";
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

  // 2. إطار ذهبي مزدوج 
  ctx.strokeStyle = "#F59E0B"; // amber-500
  ctx.lineWidth = 10;
  ctx.strokeRect(36, 36, canvasW - 72, canvasH - 72);

  ctx.strokeStyle = "#D97706"; // amber-600
  ctx.lineWidth = 3;
  ctx.strokeRect(52, 52, canvasW - 104, canvasH - 104);

  const drawCorner = (cx: number, cy: number, flipX: number, flipY: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flipX, flipY);
    ctx.strokeStyle = "#D4AF37";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 48);
    ctx.quadraticCurveTo(8, 8, 48, 8);
    ctx.stroke();
    drawCanvasStar(ctx, 28, 28, 9, "#E5C058");
    ctx.restore();
  };
  drawCorner(48, 48, 1, 1);
  drawCorner(canvasW - 48, 48, -1, 1);
  drawCorner(48, canvasH - 48, 1, -1);
  drawCorner(canvasW - 48, canvasH - 48, -1, -1);

  // 3. التاج والبسملة في القمة
  ctx.fillStyle = "#92400E"; // amber-800
  ctx.font = "bold 48px 'Tahoma', 'Segoe UI Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("👑", canvasW / 2, 110);

  ctx.font = "bold 34px 'Traditional Arabic', 'Amiri', 'Cairo', serif";
  ctx.fillText("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", canvasW / 2, 160);

  // 4. شريط العنوان الذهبي الملكي
  const ribbonW = 760;
  const ribbonH = 76;
  const ribbonX = (canvasW - ribbonW) / 2;
  const ribbonY = 190;
  const ribbon = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonW, ribbonY + ribbonH);
  ribbon.addColorStop(0, "#F59E0B");
  ribbon.addColorStop(0.5, "#FBBF24");
  ribbon.addColorStop(1, "#F59E0B");
  ctx.fillStyle = ribbon;
  ctx.beginPath();
  ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 38);
  ctx.fill();

  // ظل أسفل الشريط
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.roundRect(ribbonX + 4, ribbonY + 6, ribbonW, ribbonH, 38);
  ctx.fill();
  ctx.fillStyle = ribbon;
  ctx.beginPath();
  ctx.roundRect(ribbonX, ribbonY, ribbonW, ribbonH, 38);
  ctx.fill();

  ctx.fillStyle = "#1C1917";
  ctx.font = "bold 40px 'Traditional Arabic', 'Amiri', 'Cairo', serif";
  ctx.fillText("شَهَادَةُ فَخْرٍ وَإِتْقَانٍ قُرْآنِيّ", canvasW / 2, ribbonY + 52);

  // نص الشهادة
  ctx.fillStyle = "#44403C";
  ctx.font = "bold 26px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("تَشْهَدُ إِدَارَةُ رِعَايَةِ القُرْآنِ الكَرِيمِ لِلطِّفْلِ بِأَنَّ البَطَلَ المُبَارَكَ:", canvasW / 2, 320);

  const displayName = (!studentName || studentName === "طفلي" || studentName === "الطفل 1") ? "بطل القرآن الكريم" : studentName;

  ctx.fillStyle = "#B45309"; // amber-700
  ctx.font = "bold 64px 'Traditional Arabic', 'Amiri', 'Cairo', serif";
  ctx.fillText(displayName, canvasW / 2, 400);

  // خط متعرج تحت الاسم
  ctx.strokeStyle = "#FBBF24";
  ctx.lineWidth = 4;
  ctx.beginPath();
  const nameW = ctx.measureText(displayName).width;
  ctx.moveTo(canvasW / 2 - nameW / 2, 420);
  ctx.lineTo(canvasW / 2 + nameW / 2, 420);
  ctx.stroke();

  ctx.fillStyle = "#44403C";
  ctx.font = "bold 22px 'Cairo', 'Tahoma', 'Arial'";
  const text1 = "قَدْ تَمَيَّزَ بِحُسْنِ الاسْتِمَاعِ وَالمُوَاظَبَةِ عَلَى تِلَاوَةِ كِتَابِ اللَّهِ عَزَّ وَجَلَّ،";
  const text2 = "وَأَنْجَزَ وِرْدَهُ اليَوْمِيَّ بِجِدٍّ وَنَشَاطٍ، فَنَالَ هَذِهِ الشَّهَادَةَ تَكْرِيمَاً لَهُ وَتَشْجِيعَاً.";
  ctx.fillText(text1, canvasW / 2, 470);
  ctx.fillText(text2, canvasW / 2, 510);

  // 7. شبكة أرقام الإنجاز المطبوعة (4 بطاقات أفقية)
  const statCards = [
    { title: "الآيات المنجزة", value: `${totalAyahs} آية`, color: "#B45309", bg: "rgba(245, 158, 11, 0.1)", border: "rgba(245, 158, 11, 0.3)" },
    { title: "السور المتقنة", value: `${surahsCompleted} سورة`, color: "#047857", bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)" },
    { title: "النجوم المكتسبة", value: `${(coins || 0).toLocaleString("en-US")} ⭐`, color: "#7E22CE", bg: "rgba(168, 85, 247, 0.1)", border: "rgba(168, 85, 247, 0.3)" },
    { title: "الالتزام المتواصل", value: `${streakDays || 1} أيام`, color: "#C2410C", bg: "rgba(249, 115, 22, 0.1)", border: "rgba(249, 115, 22, 0.3)" },
  ];

  const cardW = 210;
  const cardH = 100;
  const startX = (canvasW - (cardW * 4 + 20 * 3)) / 2;
  const cardY = 570;

  statCards.forEach((st, idx) => {
    const pos = { x: startX + idx * (cardW + 20), y: cardY, w: cardW, h: cardH };
    
    ctx.fillStyle = st.bg;
    ctx.beginPath();
    ctx.roundRect(pos.x, pos.y, pos.w, pos.h, 16);
    ctx.fill();

    ctx.strokeStyle = st.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#57534E"; // stone-500
    ctx.font = "bold 15px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText(st.title, pos.x + pos.w / 2, pos.y + 35);

    ctx.fillStyle = st.color;
    ctx.font = "black 26px 'Cairo', 'Tahoma', 'Arial'";
    ctx.fillText(st.value, pos.x + pos.w / 2, pos.y + 75);
  });

  // توقيع واعتماد
  ctx.textAlign = "right";
  ctx.fillStyle = "#57534E";
  ctx.font = "bold 15px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("تاريخ المنح والتكريم:", canvasW - 250, 750);
  
  ctx.fillStyle = "#1C1917";
  ctx.font = "bold 18px 'Cairo', 'Tahoma', 'Arial'";
  const todayDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  ctx.fillText(todayDate, canvasW - 250, 780);

  ctx.textAlign = "left";
  ctx.fillStyle = "#57534E";
  ctx.font = "bold 15px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("اعتماد وليّ الأمر:", 250, 750);

  ctx.fillStyle = "#B45309";
  ctx.font = "bold 22px 'Amiri', 'Cairo', serif";
  ctx.fillText("✓ معتمد وموثق", 250, 780);

  ctx.strokeStyle = "rgba(245, 158, 11, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(150, 715);
  ctx.lineTo(canvasW - 150, 715);
  ctx.stroke();

  // 8. لوحة الحديث الشريف المحفز
  const hadithY = 812;
  const hadithW = 780;
  const hadithH = 78;
  const hadithX = (canvasW - hadithW) / 2;

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.roundRect(hadithX, hadithY, hadithW, hadithH, 22);
  ctx.fill();
  ctx.strokeStyle = "#D4AF37";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  drawCanvasStar(ctx, hadithX + 32, hadithY + hadithH / 2, 11, "#E5C058");
  drawCanvasStar(ctx, hadithX + hadithW - 32, hadithY + hadithH / 2, 11, "#E5C058");

  ctx.textAlign = "center";
  ctx.fillStyle = "#8C6514";
  ctx.font = "bold 29px 'Traditional Arabic', 'Amiri', 'Cairo', 'Tahoma', serif";
  ctx.fillText("« خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ »", canvasW / 2, hadithY + 41);

  ctx.fillStyle = "#6B7280";
  ctx.font = "bold 16px 'Cairo', 'Tahoma', 'Arial'";
  ctx.fillText("— قال رسول الله ﷺ —", canvasW / 2, hadithY + 66);

  // تحميل الشهادة
  const safeName = displayName.replace(/\s+/g, "-");
  const filename = `الشهادة-الأسطورية-${safeName}-${new Date().toISOString().split("T")[0]}.png`;
  const dataUrl = canvas.toDataURL("image/png");

  await saveImageDataUrl(dataUrl, filename);
}
