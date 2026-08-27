export const initialStudents = [
  {
    id: 'STU-1001',
    studentNumber: '2023001',
    firstName: 'Ahmet',
    lastName: 'Yılmaz',
    email: 'ahmet.yilmaz@okul.k12.tr',
    phone: '+90 532 111 2233',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=200',
    grade: '10. Sınıf',
    section: '10-A',
    status: 'active',
    gender: 'Erkek',
    birthDate: '2008-04-12',
    enrollmentDate: '2022-09-15',
    attendanceRate: 94,
    gpa: 3.85,
    feeStatus: 'paid',
    address: 'Atatürk Mah. Karanfil Sok. No: 12 Kadıköy / İstanbul',
    guardian: {
      name: 'Mehmet Yılmaz',
      relation: 'Baba',
      phone: '+90 532 999 8877',
      email: 'mehmet.yilmaz@email.com'
    },
    courses: [
      { id: 'C101', name: 'Matematik 10', teacher: 'Dr. Selin Kaya', score: 88, attendance: 96 },
      { id: 'C102', name: 'Fizik 1', teacher: 'Ahmet Öztürk', score: 92, attendance: 92 },
      { id: 'C103', name: 'Edebiyat 10', teacher: 'Ayşe Demir', score: 85, attendance: 95 }
    ]
  },
  {
    id: 'STU-1002',
    studentNumber: '2023002',
    firstName: 'Zeynep',
    lastName: 'Kaya',
    email: 'zeynep.kaya@okul.k12.tr',
    phone: '+90 533 222 3344',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
    grade: '11. Sınıf',
    section: '11-B',
    status: 'active',
    gender: 'Kız',
    birthDate: '2007-08-22',
    enrollmentDate: '2021-09-10',
    attendanceRate: 98,
    gpa: 3.92,
    feeStatus: 'paid',
    address: 'Bahçelievler Mah. Gül Cad. No: 4 Çankaya / Ankara',
    guardian: {
      name: 'Fatma Kaya',
      relation: 'Anne',
      phone: '+90 533 888 7766',
      email: 'fatma.kaya@email.com'
    },
    courses: [
      { id: 'C201', name: 'İleri Matematik', teacher: 'Selin Kaya', score: 95, attendance: 98 },
      { id: 'C202', name: 'Kimya 11', teacher: 'Murat Arslan', score: 90, attendance: 100 }
    ]
  },
  {
    id: 'STU-1003',
    studentNumber: '2023003',
    firstName: 'Can',
    lastName: 'Demir',
    email: 'can.demir@okul.k12.tr',
    phone: '+90 535 333 4455',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    grade: '9. Sınıf',
    section: '9-C',
    status: 'pending',
    gender: 'Erkek',
    birthDate: '2009-01-15',
    enrollmentDate: '2023-09-01',
    attendanceRate: 82,
    gpa: 2.75,
    feeStatus: 'pending',
    address: 'Mevlana Mah. Lale Sok. No: 8 Bornova / İzmir',
    guardian: {
      name: 'Ali Demir',
      relation: 'Baba',
      phone: '+90 535 777 6655',
      email: 'ali.demir@email.com'
    },
    courses: [
      { id: 'C001', name: 'Matematik 9', teacher: 'Selin Kaya', score: 70, attendance: 80 },
      { id: 'C002', name: 'Biyoloji 9', teacher: 'Elif Şahin', score: 68, attendance: 84 }
    ]
  },
  {
    id: 'STU-1004',
    studentNumber: '2023004',
    firstName: 'Elif',
    lastName: 'Şahin',
    email: 'elif.sahin@okul.k12.tr',
    phone: '+90 536 444 5566',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200',
    grade: '12. Sınıf',
    section: '12-A',
    status: 'active',
    gender: 'Kız',
    birthDate: '2006-11-03',
    enrollmentDate: '2020-09-01',
    attendanceRate: 91,
    gpa: 3.60,
    feeStatus: 'overdue',
    address: 'Göztepe Mah. İnönü Cad. No: 45 Konak / İzmir',
    guardian: {
      name: 'Selin Şahin',
      relation: 'Anne',
      phone: '+90 536 111 4422',
      email: 'selin.sahin@email.com'
    },
    courses: [
      { id: 'C301', name: 'YKS Geometri', teacher: 'Selin Kaya', score: 85, attendance: 90 }
    ]
  },
  {
    id: 'STU-1005',
    studentNumber: '2023005',
    firstName: 'Ege',
    lastName: 'Öztürk',
    email: 'ege.ozturk@okul.k12.tr',
    phone: '+90 537 555 6677',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
    grade: '10. Sınıf',
    section: '10-B',
    status: 'inactive',
    gender: 'Erkek',
    birthDate: '2008-06-30',
    enrollmentDate: '2022-09-15',
    attendanceRate: 65,
    gpa: 2.10,
    feeStatus: 'overdue',
    address: 'Cumhuriyet Mah. Çilek Sok. No: 3 Nilüfer / Bursa',
    guardian: {
      name: 'Hasan Öztürk',
      relation: 'Baba',
      phone: '+90 537 999 0011',
      email: 'hasan.ozturk@email.com'
    },
    courses: []
  }
];
