'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Search, Eye, Trash2, Mail, CheckCircle2, MessageSquare, Phone, Calendar, Loader2 } from 'lucide-react';

interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    fetchInquiries();
  }, []);

  const fetchInquiries = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/inquiries');
      if (res.ok) {
        const data = await res.json();
        setInquiries(data);
      }
    } catch (error) {
      console.error('Mesajlar yüklenemedi:', error);
      toast.error('Gelen talepler yüklenirken hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDetail = async (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setIsDetailOpen(true);

    if (!inquiry.isRead) {
      try {
        await fetch(`/api/admin/inquiries/${inquiry.id}/read`, {
          method: 'PATCH',
        });
        setInquiries((prev) =>
          prev.map((item) => (item.id === inquiry.id ? { ...item, isRead: true } : item))
        );
      } catch (error) {
        console.error('Okundu işaretlenemedi:', error);
      }
    }
  };

  const toggleReadStatus = async (inquiry: Inquiry, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !inquiry.isRead;
    try {
      const res = await fetch(`/api/admin/inquiries/${inquiry.id}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: newStatus }),
      });

      if (res.ok) {
        setInquiries((prev) =>
          prev.map((item) => (item.id === inquiry.id ? { ...item, isRead: newStatus } : item))
        );
        toast.success(newStatus ? 'Okundu olarak işaretlendi.' : 'Okunmadı olarak işaretlendi.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Durum güncellenirken hata meydana geldi.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/admin/inquiries/${deleteTargetId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setInquiries((prev) => prev.filter((item) => item.id !== deleteTargetId));
        toast.success('Mesaj silindi.');
        if (selectedInquiry?.id === deleteTargetId) {
          setIsDetailOpen(false);
        }
      } else {
        throw new Error();
      }
    } catch (error) {
      console.error(error);
      toast.error('Mesaj silinirken hata meydana geldi.');
    } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  };

  const filteredInquiries = inquiries.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.email.toLowerCase().includes(query) ||
      item.subject.toLowerCase().includes(query) ||
      item.message.toLowerCase().includes(query)
    );
  });

  const unreadCount = inquiries.filter((i) => !i.isRead).length;

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gelen İletişim Talepleri</h1>
          <p className="text-muted-foreground">
            Müşterileriniz tarafından iletişim formu üzerinden gönderilen mesajları yönetin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={unreadCount > 0 ? 'default' : 'secondary'} className="px-3 py-1 text-sm">
            {unreadCount} Okunmamış Mesaj
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <CardTitle>Mesaj Listesi</CardTitle>
              <CardDescription>Toplam {inquiries.length} adet mesaj bulunmaktadır.</CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Mesajlarda ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/60" />
              <p className="font-medium text-muted-foreground">Henüz mesaj bulunamadı.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Durum</TableHead>
                    <TableHead>Gönderen</TableHead>
                    <TableHead>Konu</TableHead>
                    <TableHead className="hidden md:table-cell">Tarih</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInquiries.map((inquiry) => (
                    <TableRow
                      key={inquiry.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        !inquiry.isRead ? 'bg-primary/5 font-medium' : ''
                      }`}
                      onClick={() => handleOpenDetail(inquiry)}
                    >
                      <TableCell>
                        {inquiry.isRead ? (
                          <Badge variant="secondary" className="gap-1 font-normal">
                            <CheckCircle2 className="h-3 w-3 text-muted-foreground" /> Okundu
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-blue-600 text-white hover:bg-blue-700">
                            <Mail className="h-3 w-3" /> Yeni
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold">{inquiry.name}</div>
                        <div className="text-xs text-muted-foreground">{inquiry.email}</div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate md:max-w-md">
                        {inquiry.subject}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {new Date(inquiry.createdAt).toLocaleDateString('tr-TR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Detay Gör"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDetail(inquiry);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={inquiry.isRead ? 'Okunmadı Yap' : 'Okundu Yap'}
                            onClick={(e) => toggleReadStatus(inquiry, e)}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            title="Sil"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTargetId(inquiry.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mesaj Detay Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedInquiry?.subject}</DialogTitle>
            <DialogDescription>
              {selectedInquiry &&
                new Date(selectedInquiry.createdAt).toLocaleDateString('tr-TR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
            </DialogDescription>
          </DialogHeader>

          {selectedInquiry && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Gönderen:</span>
                  <p className="font-medium">{selectedInquiry.name}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">E-Posta:</span>
                  <p className="font-medium">{selectedInquiry.email}</p>
                </div>
                {selectedInquiry.phone && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Telefon:</span>
                    <p className="font-medium">{selectedInquiry.phone}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Mesaj İçeriği
                </h4>
                <div className="rounded-md border p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedInquiry.message}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            {selectedInquiry && (
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteTargetId(selectedInquiry.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Sil
              </Button>
            )}
            <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silme Onay Dialog */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mesajı silmek istediğinize emin misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz. İletişim talebi kalıcı olarak sistemden silinecektir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Siliniyor...' : 'Evet, Sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
