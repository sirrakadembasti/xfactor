export const mockStudents = [
  {
    id: "STD-1001",
    firstName: "Ahmet",
    lastName: "Yılmaz",
    email: "ahmet.yilmaz@okul.k12.tr",
    phone: "+90 532 111 2233",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    gradeLevel: "10. Sınıf",
    classSection: "10-A",
    status: "Active",
    enrollmentDate: "2023-09-01",
    gpa: 3.85,
    attendanceRate: 96,
    gender: "Erkek",
    birthDate: "2007-04-12",
    tcNo: "12345678901",
    parentName: "Mehmet Yılmaz",
    parentPhone: "+90 555 987 6543",
    parentEmail: "mehmet.yilmaz@gmail.com",
    address: "Atatürk Mah. Karanfil Sok. No:12 D:4, Kadıköy / İstanbul",
    courses: [
      { id: "MAT101", name: "Matematik X", teacher: "Prof. Dr. Hasan Kaya", grade: 92, progress: 85, status: "Devam Ediyor" },
      { id: "FİZ101", name: "Fizik I", teacher: "Dr. Ayşe Demir", grade: 88, progress: 80, status: "Devam Ediyor" },
      { id: "KİM101", name: "Kimya I", teacher: "Kemal Sunal", grade: 95, progress: 90, status: "Devam Ediyor" },
      { id: "EBD101", name: "Edebiyat", teacher: "Zeynep Şahin", grade: 84, progress: 78, status: "Devam Ediyor" }
    ],
    payments: [
      { id: "PAY-201", title: "1. Taksit Okul Ücreti", amount: 15000, dueDate: "2023-09-15", paidDate: "2023-09-10", status: "Ödendi" },
      { id: "PAY-202", title: "2. Taksit Okul Ücreti", amount: 15000, dueDate: "2023-11-15", paidDate: "2023-11-12", status: "Ödendi" },
      { id: "PAY-203", title: "3. Taksit Okul Ücreti", amount: 15000, dueDate: "2024-01-15", paidDate: null, status: "Bekliyor" },
      { id: "PAY-204", title: "Kitap ve Materyal Ücreti", amount: 4500, dueDate: "2023-09-01", paidDate: "2023-08-28", status: "Ödendi" }
    ],
    attendanceHistory: [
      { date: "2024-02-20", status: "Geldi", notes: "-" },
      { date: "2024-02-19", status: "Geldi", notes: "-" },
      { date: "2024-02-16", status: "Geç Kaldı", notes: "15 dk gecikme" },
      { date: "2024-02-15", status: "İzinli", notes: "Sağlık Raporu" },
      { date: "2024-02-14", status: "Geldi", notes: "-" }
    ],
    activityLog: [
      { id: "ACT-1", action: "Matematik Ödevi Teslim Edildi", date: "2024-02-20 14:30", ip: "192.168.1.45" },
      { id: "ACT-2", action: "Sisteme Giriş Yapıldı", date: "2024-02-20 08:15", ip: "192.168.1.45" },
      { id: "ACT-3", action: "Fizik Sınav Sonucu Görüntülendi", date: "2024-02-18 19:10", ip: "192.168.1.45" }
    ]
  },
  {
    id: "STD-1002",
    firstName: "Zeynep",
    lastName: "Kaya",
    email: "zeynep.kaya@okul.k12.tr",
    phone: "+90 533 222 3344",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
    gradeLevel: "11. Sınıf",
    classSection: "11-B",
    status: "Active",
    enrollmentDate: "2022-09-01",
    gpa: 3.92,
    attendanceRate: 98,
    gender: "Kadın",
    birthDate: "2006-08-22",
    tcNo: "98765432101",
    parentName: "Ali Kaya",
    parentPhone: "+90 555 123 4567",
    parentEmail: "ali.kaya@gmail.com",
    address: "Çankaya Mah. 100. Yıl Bulvarı No:45, Çankaya / Ankara",
    courses: [
      { id: "MAT201", name: "İleri Matematik", teacher: "Prof. Dr. Hasan Kaya", grade: 98, progress: 92, status: "Devam Ediyor" },
      { id: "BIO101", name: "Biyoloji II", teacher: "Sibel Öztürk", grade: 94, progress: 88, status: "Devam Ediyor" },
      { id: "KİM201", name: "Organik Kimya", teacher: "Kemal Sunal", grade: 91, progress: 85, status: "Devam Ediyor" }
    ],
    payments: [
      { id: "PAY-205", title: "1. Taksit Okul Ücreti", amount: 18000, dueDate: "2023-09-15", paidDate: "2023-09-12", status: "Ödendi" },
      { id: "PAY-206", title: "2. Taksit Okul Ücreti", amount: 18000, dueDate: "2023-11-15", paidDate: "2023-11-14", status: "Ödendi" }
    ],
    attendanceHistory: [
      { date: "2024-02-20", status: "Geldi", notes: "-" },
      { date: "2024-02-19", status: "Geldi", notes: "-" },
      { date: "2024-02-16", status: "Geldi", notes: "-" }
    ],
    activityLog: [
      { id: "ACT-4", action: "Biyoloji Projesi Yüklendi", date: "2024-02-19 21:00", ip: "176.234.12.8" }
    ]
  },
  {
    id: "STD-1003",
    firstName: "Can",
    lastName: "Öztürk",
    email: "can.ozturk@okul.k12.tr",
    phone: "+90 534 333 4455",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    gradeLevel: "9. Sınıf",
    classSection: "9-C",
    status: "Inactive",
    enrollmentDate: "2023-09-01",
    gpa: 2.40,
    attendanceRate: 78,
    gender: "Erkek",
    birthDate: "2008-11-05",
    tcNo: "45678901234",
    parentName: "Fatma Öztürk",
    parentPhone: "+90 555 444 3322",
    parentEmail: "fatma.ozturk@hotmail.com",
    address: "Konak Mah. Mithatpaşa Cad. No:88, Konak / İzmir",
    courses: [
      { id: "MAT09", name: "Temel Matematik", teacher: "Prof. Dr. Hasan Kaya", grade: 65, progress: 70, status: "Devam Ediyor" },
      { id: "TAR09", name: "Tarih I", teacher: "Murat Bardakçı", grade: 70, progress: 65, status: "Devam Ediyor" }
    ],
    payments: [
      { id: "PAY-207", title: "1. Taksit Okul Ücreti", amount: 14000, dueDate: "2023-09-15", paidDate: null, status: "Gecikmiş" }
    ],
    attendanceHistory: [
      { date: "2024-02-20", status: "Gelmedi", notes: "Mazeretsiz" },
      { date: "2024-02-19", status: "Gelmedi", notes: "Mazeretsiz" },
      { date: "2024-02-16", status: "Geldi", notes: "-" }
    ],
    activityLog: [
      { id: "ACT-5", action: "Sisteme Giriş Yapıldı", date: "2024-02-12 10:00", ip: "85.105.44.12" }
    ]
  }