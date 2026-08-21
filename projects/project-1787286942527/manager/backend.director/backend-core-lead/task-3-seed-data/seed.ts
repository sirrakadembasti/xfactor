import { PrismaClient, Role, Difficulty } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Veritabanı temizleniyor... ---');
  await prisma.attemptAnswer.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.quizQuestion.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.question.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.class.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.user.deleteMany();

  console.log('--- Şifre hashleniyor... ---');
  const defaultPasswordHash = await bcrypt.hash('123456', 10);

  console.log('--- Sınıflar oluşturuluyor... ---');
  const class9A = await prisma.class.create({
    data: {
      name: '9-A',
      code: 'CLS-9A',
      description: '9. Sınıf A Şubesi (Temel Seviye)',
    },
  });

  const class10A = await prisma.class.create({
    data: {
      name: '10-A',
      code: 'CLS-10A',
      description: '10. Sınıf A Şubesi (Orta Seviye)',
    },
  });

  const class11B = await prisma.class.create({
    data: {
      name: '11-B',
      code: 'CLS-11B',
      description: '11. Sınıf B Şubesi (Sayısal Ağrılıklı)',
    },
  });

  console.log('--- Dersler oluşturuluyor... ---');
  const subMath = await prisma.subject.create({
    data: {
      name: 'Matematik',
      code: 'MAT101',
      description: 'Fonksiyonlar, Cebir, Geometri ve Trigonometri',
      color: '#3B82F6',
    },
  });

  const subPhysics = await prisma.subject.create({
    data: {
      name: 'Fizik',
      code: 'FIZ101',
      description: 'Kuvvet, Hareket, Elektrik ve Manyetizma',
      color: '#8B5CF6',
    },
  });

  const subBio = await prisma.subject.create({
    data: {
      name: 'Biyoloji',
      code: 'BIY101',
      description: 'Hücre, Genetik, Ekoloji ve İnsan Fizyolojisi',
      color: '#10B981',
    },
  });

  const subHistory = await prisma.subject.create({
    data: {
      name: 'Tarih',
      code: 'TAR101',
      description: 'İlk Çağ Uygarlıkları, Türk ve Dünya Tarihi',
      color: '#F59E0B',
    },
  });

  console.log('--- Kullanıcılar (Admin & Öğretmenler) oluşturuluyor... ---');
  await prisma.user.create({
    data: {
      email: 'admin@okul.com',
      password: defaultPasswordHash,
      name: 'Sistem Yöneticisi',
      role: Role.ADMIN,
    },
  });

  const teacherMath = await prisma.user.create({
    data: {
      email: 'ahmet.kaya@okul.com',
      password: defaultPasswordHash,
      name: 'Ahmet Kaya',
      role: Role.TEACHER,
    },
  });

  const teacherScience = await prisma.user.create({
    data: {
      email: 'zeynep.demir@okul.com',
      password: defaultPasswordHash,
      name: 'Zeynep Demir',
      role: Role.TEACHER,
    },
  });

  const teacherHistory = await prisma.user.create({
    data: {
      email: 'mustafa.celik@okul.com',
      password: defaultPasswordHash,
      name: 'Mustafa Çelik',
      role: Role.TEACHER,
    },
  });

  console.log('--- Öğrenciler oluşturuluyor... ---');
  const studentData = [
    { name: 'Ali Yılmaz', email: 'ali.yilmaz@ogrenci.com', studentNo: '101', classId: class9A.id },
    { name: 'Ayşe Kaya', email: 'ayse.kaya@ogrenci.com', studentNo: '102', classId: class9A.id },
    { name: 'Mehmet Öztürk', email: 'mehmet.ozturk@ogrenci.com', studentNo: '103', classId: class9A.id },
    { name: 'Elif Şahin', email: 'elif.sahin@ogrenci.com', studentNo: '201', classId: class10A.id },
    { name: 'Burak Yıldız', email: 'burak.yildiz@ogrenci.com', studentNo: '202', classId: class10A.id },
    { name: 'Ceren Aydın', email: 'ceren.aydin@ogrenci.com', studentNo: '203', classId: class10A.id },
    { name: 'Emre Koç', email: 'emre.koc@ogrenci.com', studentNo: '204', classId: class10A.id },
    { name: 'Fatma Arslan', email: 'fatma.arslan@ogrenci.com', studentNo: '301', classId: class11B.id },
    { name: 'Can Polat', email: 'can.polat@ogrenci.com', studentNo: '302', classId: class11B.id },
    { name: 'Deniz Eren', email: 'deniz.eren@ogrenci.com', studentNo: '303', classId: class11B.id },
  ];

  const createdStudents = [];
  for (const s of studentData) {
    const user = await prisma.user.create({
      data: {
        name: s.name,
        email: s.email,
        password: defaultPasswordHash,
        role: Role.STUDENT,
        studentProfile: {
          create: {
            studentNo: s.studentNo,
            classId: s.classId,
          },
        },
      },
    });
    createdStudents.push(user);
  }

  console.log('--- Soru Havuzu Oluşturuluyor... ---');
  const mathQuestionsData = [
    {
      text: 'f(x) = 2x + 5 fonksiyonu için f(3) değeri kaçtır?',
      options: JSON.stringify(['9', '11', '13', '15']),
      correctAnswer: '11',
      explanation: 'f(3) = 2*(3) + 5 = 6 + 5 = 11 elde edilir.',
      difficulty: Difficulty.EASY,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
    {
      text: 'x² - 5x + 6 = 0 denkleminin çözüm kümesi nedir?',
      options: JSON.stringify(['{2, 3}', '{-2, -3}', '{1, 6}', '{-1, -6}']),
      correctAnswer: '{2, 3}',
      explanation: '(x - 2)(x - 3) = 0 denkleminden kökler 2 ve 3 bulunur.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
    {
      text: 'log₂(32) ifadesinin değeri kaçtır?',
      options: JSON.stringify(['3', '4', '5', '6']),
      correctAnswer: '5',
      explanation: '2^5 = 32 olduğundan log₂(32) = 5 tir.',
      difficulty: Difficulty.EASY,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
    {
      text: 'Bir dik üçgende hipotenüs 10 cm, dik kenarlardan biri 6 cm ise diğer dik kenar kaç cm dir?',
      options: JSON.stringify(['7', '8', '9', '6√2']),
      correctAnswer: '8',
      explanation: 'Pisagor bağıntısından: 6² + b² = 10² => 36 + b² = 100 => b² = 64 => b = 8 cm.',
      difficulty: Difficulty.EASY,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
    {
      text: 'sin(30°) + cos(60°) toplamının sonucu kaçtır?',
      options: JSON.stringify(['0', '1/2', '1', '√3']),
      correctAnswer: '1',
      explanation: 'sin(30°) = 1/2 ve cos(60°) = 1/2 olduğundan toplam 1/2 + 1/2 = 1 eder.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
    {
      text: 'P(x) = x³ - 2x² + 4x - 8 polinomunun (x - 2) ile bölümünden kalan kaçtır?',
      options: JSON.stringify(['0', '2', '4', '8']),
      correctAnswer: '0',
      explanation: 'P(2) = 2³ - 2(2)² + 4(2) - 8 = 8 - 8 + 8 - 8 = 0.',
      difficulty: Difficulty.HARD,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
    {
      text: '5 elemanlı bir kümenin 3 elemanlı alt küme sayısı (C(5,3)) kaçtır?',
      options: JSON.stringify(['5', '10', '15', '20']),
      correctAnswer: '10',
      explanation: 'C(5,3) = 5! / (3! * 2!) = (5 * 4) / 2 = 10.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subMath.id,
      createdById: teacherMath.id,
    },
  ];

  const physicsQuestionsData = [
    {
      text: 'Hızı 20 m/s olan bir araç 5 saniye boyunca sabit hızla ilerlerse kaç metre yol alır?',
      options: JSON.stringify(['50', '75', '100', '125']),
      correctAnswer: '100',
      explanation: 'x = v * t formülünden x = 20 * 5 = 100 m bulunur.',
      difficulty: Difficulty.EASY,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Kütlesi 4 kg olan bir cisme 20 N net kuvvet uygulanırsa cismin ivmesi kaç m/s² olur?',
      options: JSON.stringify(['2', '5', '10', '80']),
      correctAnswer: '5',
      explanation: 'F = m * a => a = F / m => a = 20 / 4 = 5 m/s².',
      difficulty: Difficulty.EASY,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Direnci 6 Ohm olan bir iletkenin uçları arasındaki potansiyel farkı 18 Volt ise geçen akım şiddeti kaç Amperdir?',
      options: JSON.stringify(['2', '3', '4', '12']),
      correctAnswer: '3',
      explanation: 'Ohm Yasası: V = I * R => I = V / R = 18 / 6 = 3 A.',
      difficulty: Difficulty.EASY,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Yerçekimi ivmesinin 10 m/s² olduğu yerde, 20 metre yükseklikten serbest bırakılan cisim kaç saniyede yere düşer?',
      options: JSON.stringify(['1', '2', '3', '4']),
      correctAnswer: '2',
      explanation: 'h = 1/2 * g * t² => 20 = 5 * t² => t² = 4 => t = 2 s.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Işığın boşluktaki hızı yaklaşık olarak ne kadardır?',
      options: JSON.stringify(['300.000 km/s', '150.000 km/s', '3.000 km/s', '30.000 km/s']),
      correctAnswer: '300.000 km/s',
      explanation: 'Işık boşlukta saniyede yaklaşık 3x10⁸ m/s yani 300.000 km/s hızla yayılır.',
      difficulty: Difficulty.EASY,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Sürtünmesiz ortamda 2 kg kütleli bir cisim 10 m/s hızla hareket ederken sahip olduğu kinetik enerji kaç Joule dür?',
      options: JSON.stringify(['50', '100', '200', '400']),
      correctAnswer: '100',
      explanation: 'Ek = 1/2 * m * v² = 1/2 * 2 * (10)² = 100 J.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
    },
  ];

  const bioQuestionsData = [
    {
      text: 'Hücrenin enerji santrali olarak bilinen ve ATP üreten organel hangisidir?',
      options: JSON.stringify(['Ribozom', 'Mitokondri', 'Golgi Cisimciği', 'Lizozom']),
      correctAnswer: 'Mitokondri',
      explanation: 'Mitokondri hücresel solunum ile ATP üretiminden sorumlu organeldir.',
      difficulty: Difficulty.EASY,
      subjectId: subBio.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Bitki hücrelerinde fotosentezin gerçekleştiği organel aşağıdakilerden hangisidir?',
      options: JSON.stringify(['Kloroplast', 'Koful', 'Sentrozom', 'Endoplazmik Retikulum']),
      correctAnswer: 'Kloroplast',
      explanation: 'Fotosentez kloroplast organelinde klorofil pigmentleri sayesinde gerçekleşir.',
      difficulty: Difficulty.EASY,
      subjectId: subBio.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Aşağıdakilerden hangisi DNA yapısında bulunup RNA yapısında bulunmayan organik bazdır?',
      options: JSON.stringify(['Adenin', 'Guanin', 'Timin', 'Urasil']),
      correctAnswer: 'Timin',
      explanation: 'Timin sadece DNA da, Urasil ise sadece RNA da bulunur.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subBio.id,
      createdById: teacherScience.id,
    },
    {
      text: 'İnsan vücudunda kan şekerini düşüren hormon hangisidir?',
      options: JSON.stringify(['Glukagon', 'İnsülin', 'Adrenalin', 'Tiroksin']),
      correctAnswer: 'İnsülin',
      explanation: 'Pankreastan salgılanan insülin hormonu kandaki glikozun hücrelere geçişini sağlayarak kan şekerini düşürür.',
      difficulty: Difficulty.EASY,
      subjectId: subBio.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Hangisi bir memeli hayvan türü değildir?',
      options: JSON.stringify(['Yunus', 'Yarasa', 'Penguen', 'Balina']),
      correctAnswer: 'Penguen',
      explanation: 'Penguen uçamayan bir kuş türüdür. Yunus, yarasa ve balina memelidir.',
      difficulty: Difficulty.EASY,
      subjectId: subBio.id,
      createdById: teacherScience.id,
    },
    {
      text: 'Hücre bölünmesi sırasında kromozomların ekvatoral düzlemde tek sıra halinde dizildiği evre hangisidir?',
      options: JSON.stringify(['Profaz', 'Metafaz', 'Anafaz', 'Telofaz']),
      correctAnswer: 'Metafaz',
      explanation: 'Metafaz evresinde kromozomlar ekvatoral düzleme dizilir ve en net görüldükleri evredir.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subBio.id,
      createdById: teacherScience.id,
    },
  ];

  const historyQuestionsData = [
    {
      text: 'Türkiye Cumhuriyeti hangi tarihte ilan edilmiştir?',
      options: JSON.stringify(['23 Nisan 1920', '19 Mayıs 1919', '29 Ekim 1923', '30 Ağustos 1922']),
      correctAnswer: '29 Ekim 1923',
      explanation: 'Cumhuriyet, 29 Ekim 1923 tarihinde TBMM tarafından ilan edilmiştir.',
      difficulty: Difficulty.EASY,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
    },
    {
      text: 'Tarihte bilinen ilk yazılı antlaşma hangisidir?',
      options: JSON.stringify(['Kadeş Antlaşması', 'Versay Antlaşması', 'Lozan Antlaşması', 'Karasu Antlaşması']),
      correctAnswer: 'Kadeş Antlaşması',
      explanation: 'MÖ 1280 civarında Mısırlılar ile Hititliler arasında imzalanan Kadeş Antlaşmasıdır.',
      difficulty: Difficulty.EASY,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
    },
    {
      text: 'Osmanlı Devleti’nin kurucusu kabul edilen padişah kimdir?',
      options: JSON.stringify(['Osman Gazi', 'Orhan Gazi', 'Ertuğrul Gazi', 'Fatih Sultan Mehmet']),
      correctAnswer: 'Osman Gazi',
      explanation: 'Osmanlı Beyliği 1299 civarında Osman Gazi tarafından kurulmuştur.',
      difficulty: Difficulty.EASY,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
    },
    {
      text: 'Kurtuluş Savaşı döneminde Doğu Cephesi Komutanı kimdir?',
      options: JSON.stringify(['İsmet İnönü', 'Kazım Karabekir', 'Fevzi Çakmak', 'Rauf Orbay']),
      correctAnswer: 'Kazım Karabekir',
      explanation: 'Doğu Cephesi Komutanı Kazım Karabekir Paşa’dır ve Gümrü Antlaşması’nı imzalamıştır.',
      difficulty: Difficulty.MEDIUM,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
    },
    {
      text: 'İstanbul hangi yıl fethedilmiştir?',
      options: JSON.stringify(['1071', '1299', '1453', '1517']),
      correctAnswer: '1453',
      explanation: 'Fatih Sultan Mehmet komutasındaki Osmanlı ordusu 29 Mayıs 1453 te İstanbul u fethetmiştir.',
      difficulty: Difficulty.EASY,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
    },
    {
      text: 'Türklerin Anadolu ya kesin olarak yerleşmesini sağlayan savaş hangisidir?',
      options: JSON.stringify(['Pasinler', 'Malazgirt', 'Miryokefalon', 'Katvan']),
      correctAnswer: 'Miryokefalon',
      explanation: '1176 Miryokefalon Savaşı ile Anadolu nun kesin Türk yurdu olduğu tescillenmiştir.',
      difficulty: Difficulty.HARD,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
    },
  ];

  const createdMathQuestions = [];
  for (const q of mathQuestionsData) {
    createdMathQuestions.push(await prisma.question.create({ data: q }));
  }

  const createdPhysicsQuestions = [];
  for (const q of physicsQuestionsData) {
    createdPhysicsQuestions.push(await prisma.question.create({ data: q }));
  }

  const createdBioQuestions = [];
  for (const q of bioQuestionsData) {
    createdBioQuestions.push(await prisma.question.create({ data: q }));
  }

  const createdHistoryQuestions = [];
  for (const q of historyQuestionsData) {
    createdHistoryQuestions.push(await prisma.question.create({ data: q }));
  }

  console.log('--- Sınavlar (Quizler) Oluşturuluyor... ---');
  const mathQuiz = await prisma.quiz.create({
    data: {
      title: 'Temel ve İleri Matematik Seviye Değerlendirme',
      description: 'Cebir, Trigonometri, Fonksiyonlar ve Geometri konularını kapsayan kapsamlı test.',
      duration: 30,
      subjectId: subMath.id,
      createdById: teacherMath.id,
      passPercentage: 60,
      shuffleQuestions: true,
      isPublished: true,
      questions: {
        create: createdMathQuestions.map((q, idx) => ({
          questionId: q.id,
          order: idx + 1,
        })),
      },
    },
  });

  const scienceQuiz = await prisma.quiz.create({
    data: {
      title: 'Genel Fen Bilimleri (Fizik & Biyoloji)',
      description: 'Mekanik, Elektrik, Hücre Yapısı ve Temel Genetik konuları ortak sınavı.',
      duration: 40,
      subjectId: subPhysics.id,
      createdById: teacherScience.id,
      passPercentage: 50,
      shuffleQuestions: true,
      isPublished: true,
      questions: {
        create: [
          ...createdPhysicsQuestions.slice(0, 4).map((q, idx) => ({
            questionId: q.id,
            order: idx + 1,
          })),
          ...createdBioQuestions.slice(0, 4).map((q, idx) => ({
            questionId: q.id,
            order: idx + 5,
          })),
        ],
      },
    },
  });

  const historyQuiz = await prisma.quiz.create({
    data: {
      title: 'Türk ve Dünya Tarihi Genel Kültür Sınavı',
      description: 'İlk Çağ Uygarlıklarından Türkiye Cumhuriyeti Dönemine genel değerlendirme.',
      duration: 25,
      subjectId: subHistory.id,
      createdById: teacherHistory.id,
      passPercentage: 60,
      shuffleQuestions: false,
      isPublished: true,
      questions: {
        create: createdHistoryQuestions.map((q, idx) => ({
          questionId: q.id,
          order: idx + 1,
        })),
      },
    },
  });

  console.log('--- Örnek Tamamlanmış Sınav Denemeleri Oluşturuluyor... ---');
  // Öğrenci 1 (Ali) Matematik Sınavını Çözüyor (Yüksek Başarı)
  const aliAttempt = await prisma.quizAttempt.create({
    data: {
      quizId: mathQuiz.id,
      studentId: createdStudents[0].id,
      score: 85.71,
      totalQuestions: createdMathQuestions.length,
      correctAnswers: 6,
      wrongAnswers: 1,
      emptyAnswers: 0,
      isPassed: true,
      startedAt: new Date(Date.now() - 3600 * 1000 * 24),
      completedAt: new Date(Date.now() - 3600 * 1000 * 24 + 18 * 60 * 1000),
      answers: {
        create: createdMathQuestions.map((q, idx) => ({
          questionId: q.id,
          selectedOption: idx === 1 ? '{-2, -3}' : q.correctAnswer,
          isCorrect: idx !== 1,
        })),
      },
    },
  });

  // Öğrenci 2 (Ayşe) Tarih Sınavını Çözüyor (Tam Puan)
  const ayseAttempt = await prisma.quizAttempt.create({
    data: {
      quizId: historyQuiz.id,
      studentId: createdStudents[1].id,
      score: 100,
      totalQuestions: createdHistoryQuestions.length,
      correctAnswers: 6,
      wrongAnswers: 0,
      emptyAnswers: 0,
      isPassed: true,
      startedAt: new Date(Date.now() - 3600 * 1000 * 12),
      completedAt: new Date(Date.now() - 3600 * 1000 * 12 + 12 * 60 * 1000),
      answers: {
        create: createdHistoryQuestions.map((q) => ({
          questionId: q.id,
          selectedOption: q.correctAnswer,
          isCorrect: true,
        })),
      },
    },
  });

  // Öğrenci 4 (Elif) Fen Sınavını Çözüyor
  const scienceQuestionsList = [...createdPhysicsQuestions.slice(0, 4), ...createdBioQuestions.slice(0, 4)];
  const elifAttempt = await prisma.quizAttempt.create({
    data: {
      quizId: scienceQuiz.id,
      studentId: createdStudents[3].id,
      score: 75.0,
      totalQuestions: 8,
      correctAnswers: 6,
      wrongAnswers: 2,
      emptyAnswers: 0,
      isPassed: true,
      startedAt: new Date(Date.now() - 3600 * 1000 * 5),
      completedAt: new Date(Date.now() - 3600 * 1000 * 5 + 25 * 60 * 1000),
      answers: {
        create: scienceQuestionsList.map((q, idx) => ({
          questionId: q.id,
          selectedOption: idx === 0 || idx === 4 ? 'Yanlış Cevap' : q.correctAnswer,
          isCorrect: idx !== 0 && idx !== 4,
        })),
      },
    },
  });

  console.log('--- Seed verisi başarıyla yüklendi! ---');
  console.log('Yönetici Girişi: admin@okul.com / 123456');
  console.log('Öğretmen Girişi: ahmet.kaya@okul.com / 123456');
  console.log('Öğrenci Girişi: ali.yilmaz@ogrenci.com / 123456');
}

main()
  .catch((e) => {
    console.error('Seed sırasında hata meydana geldi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
