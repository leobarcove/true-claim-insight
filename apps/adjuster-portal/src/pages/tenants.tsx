import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Building2, Users, Plus, Pencil, Trash2, Check, X, Shield, Network } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useUserTenants,
  useCreateUserTenant,
  useUpdateUserTenant,
  useDeleteUserTenant,
  Tenant,
  User,
  UserTenant,
} from '@/hooks/use-admin';
import { convertToTitleCase } from '@/lib/utils';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

export function TenantsPage() {
  const [activeTab, setActiveTab] = useState('tenants');
  const { toast } = useToast();

  const { data: tenants, isLoading: isLoadingTenants } = useTenants();
  const { data: users, isLoading: isLoadingUsers } = useUsers();
  const { data: userTenants, isLoading: isLoadingUserTenants } = useUserTenants();

  const tabs = [
    { id: 'tenants', label: 'Tenants', icon: Building2 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'associations', label: 'Associations', icon: Network },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50">
      <Header title="Tenants" description="Manage tenants, users and their associations" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto space-y-8">
          {/* Horizontal Tabs */}
          <div className="flex items-center border-b border-border">
            <div className="flex gap-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 font-medium text-sm transition-all border-b-2 -mb-[1px] flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <main>
            {activeTab === 'tenants' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <TenantsTable
                  tenants={tenants || []}
                  isLoading={isLoadingTenants}
                  onRefresh={() => {}}
                />
              </div>
            )}

            {activeTab === 'users' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <UsersTable users={users || []} isLoading={isLoadingUsers} onRefresh={() => {}} />
              </div>
            )}

            {activeTab === 'associations' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <UserTenantsTable
                  associations={userTenants || []}
                  tenants={tenants || []}
                  users={users || []}
                  isLoading={isLoadingUserTenants}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function TenantsTable({
  tenants,
  isLoading,
}: {
  tenants: Tenant[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const deleteMutation = useDeleteTenant();
  const { toast } = useToast();

  const handleSave = async (data: Partial<Tenant>) => {
    try {
      if (editingTenant) {
        await updateMutation.mutateAsync({ id: editingTenant.id, ...data });
        toast({ title: 'Success', description: 'Tenant updated successfully' });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: 'Success', description: 'Tenant created successfully' });
      }
      setIsDialogOpen(false);
      setEditingTenant(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save tenant', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync(deletingId);
      toast({ title: 'Success', description: 'Tenant deleted successfully' });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete tenant', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Organization Tenants</CardTitle>
          <CardDescription>View and manage all active tenants in the system.</CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditingTenant(null);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        <div className="transition-all duration-300">
          {isLoading ? (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : tenants.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No tenants found</h3>
              <p className="text-muted-foreground">No tenants available yet.</p>
            </div>
          ) : (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Type</TableHead>
                    <TableHead className="text-center">Tier</TableHead>
                    <TableHead className="text-center">Created</TableHead>
                    <TableHead className="text-center">Updated</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {tenants.map(tenant => (
                    <TableRow key={tenant.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">{tenant.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{convertToTitleCase(tenant.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            tenant.subscriptionTier === 'PROFESSIONAL' ||
                            tenant.subscriptionTier === 'ENTERPRISE'
                              ? 'success'
                              : 'secondary'
                          }
                        >
                          {convertToTitleCase(tenant.subscriptionTier)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {tenant.createdAt ? (
                          <div className="flex flex-col text-xs">
                            <span>{format(new Date(tenant.createdAt), 'MMM dd, yyyy')}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(tenant.createdAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {tenant.updatedAt ? (
                          <div className="flex flex-col text-xs">
                            <span>{format(new Date(tenant.updatedAt), 'MMM dd, yyyy')}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(tenant.updatedAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingTenant(tenant);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingId(tenant.id);
                              setIsDeleteDialogOpen(true);
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
        </div>
      </CardContent>

      <TenantFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        tenant={editingTenant}
        onSave={handleSave}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Tenant"
        description="Are you sure you want to delete this tenant? This action cannot be undone."
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </Card>
  );
}

function TenantFormDialog({ open, onOpenChange, tenant, onSave, isLoading }: any) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'INSURER',
    subscriptionTier: 'BASIC',
  });

  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name,
        type: tenant.type,
        subscriptionTier: tenant.subscriptionTier || 'BASIC',
      });
    } else {
      setFormData({ name: '', type: 'INSURER', subscriptionTier: 'BASIC' });
    }
  }, [tenant, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tenant ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tenant Name</Label>
            <Input
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={formData.type}
              onValueChange={v => setFormData({ ...formData, type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INSURER">Insurer</SelectItem>
                <SelectItem value="ADJUSTING_FIRM">Adjusting Firm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subscription Tier</Label>
            <Select
              value={formData.subscriptionTier}
              onValueChange={v => setFormData({ ...formData, subscriptionTier: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BASIC">Basic</SelectItem>
                <SelectItem value="PROFESSIONAL">Professional</SelectItem>
                <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onSave(formData)} disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersTable({
  users,
  isLoading,
}: {
  users: User[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const { toast } = useToast();

  const handleSave = async (data: any) => {
    try {
      if (editingUser) {
        await updateMutation.mutateAsync({ id: editingUser.id, ...data });
        toast({ title: 'Success', description: 'User updated successfully' });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: 'Success', description: 'User created successfully' });
      }
      setIsDialogOpen(false);
      setEditingUser(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save user', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync(deletingId);
      toast({ title: 'Success', description: 'User deleted successfully' });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>System Users</CardTitle>
          <CardDescription>View and manage all registered users in the system.</CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditingUser(null);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        <div className="transition-all duration-300">
          {isLoading ? (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={6}>
                      <Skeleton className="h-4 w-full" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No users found</h3>
              <p className="text-muted-foreground">No users available yet.</p>
            </div>
          ) : (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-center">Last Login</TableHead>
                    <TableHead className="text-center">Created</TableHead>
                    <TableHead className="text-center">Updated</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {users.map(user => (
                    <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">{user.fullName}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.phoneNumber}</TableCell>
                      <TableCell className="text-center">
                        {(user as any).lastLoginAt ? (
                          <div className="flex flex-col text-xs">
                            <span>
                              {format(new Date((user as any).lastLoginAt), 'MMM dd, yyyy')}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date((user as any).lastLoginAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(user as any).createdAt ? (
                          <div className="flex flex-col text-xs">
                            <span>{format(new Date((user as any).createdAt), 'MMM dd, yyyy')}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date((user as any).createdAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(user as any).updatedAt ? (
                          <div className="flex flex-col text-xs">
                            <span>{format(new Date((user as any).updatedAt), 'MMM dd, yyyy')}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date((user as any).updatedAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingUser(user);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingId(user.id);
                              setIsDeleteDialogOpen(true);
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
        </div>
      </CardContent>

      <UserFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        user={editingUser}
        onSave={handleSave}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </Card>
  );
}

function UserFormDialog({ open, onOpenChange, user, onSave, isLoading }: any) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    licenseNumber: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        password: '',
        licenseNumber: user.licenseNumber || '',
      });
    } else {
      setFormData({ fullName: '', email: '', phoneNumber: '', password: '', licenseNumber: '' });
    }
  }, [user, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? 'Edit User' : 'Add User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              value={formData.fullName}
              onChange={e => setFormData({ ...formData, fullName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input
              value={formData.phoneNumber}
              onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
            />
          </div>
          {!user && (
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          )}
          {user && (
            <div className="space-y-2">
              <Label>License Number</Label>
              <Input
                value={formData.licenseNumber}
                onChange={e => setFormData({ ...formData, licenseNumber: e.target.value })}
                placeholder="e.g. LIC-12345"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onSave(formData)} disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserTenantsTable({
  associations,
  tenants,
  users,
  isLoading,
}: {
  associations: UserTenant[];
  tenants: Tenant[];
  users: User[];
  isLoading: boolean;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssoc, setEditingAssoc] = useState<UserTenant | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createMutation = useCreateUserTenant();
  const updateMutation = useUpdateUserTenant();
  const deleteMutation = useDeleteUserTenant();
  const { toast } = useToast();

  const handleSave = async (data: any) => {
    try {
      if (editingAssoc) {
        await updateMutation.mutateAsync({ id: editingAssoc.id, ...data });
        toast({ title: 'Success', description: 'Association updated successfully' });
      } else {
        await createMutation.mutateAsync(data);
        toast({ title: 'Success', description: 'Association created successfully' });
      }
      setIsDialogOpen(false);
      setEditingAssoc(null);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save association', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync(deletingId);
      toast({ title: 'Success', description: 'Association deleted successfully' });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete association',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>User-Tenant Associations</CardTitle>
          <CardDescription>Manage which users belong to which tenants.</CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditingAssoc(null);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      </CardHeader>
      <CardContent>
        <div className="transition-all duration-300">
          {isLoading ? (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={7}>
                      <Skeleton className="h-4 w-full" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : associations.length === 0 ? (
            <div className="bg-card rounded-xl border shadow-sm p-12 text-center">
              <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No associations found</h3>
              <p className="text-muted-foreground">No role associations available yet.</p>
            </div>
          ) : (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead className="text-center">Role</TableHead>
                    <TableHead className="text-center">Default</TableHead>
                    <TableHead className="text-center">Created</TableHead>
                    <TableHead className="text-center">Updated</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {associations.map(assoc => (
                    <TableRow key={assoc.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">{assoc.user.fullName}</TableCell>
                      <TableCell>{assoc.tenant.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{convertToTitleCase(assoc.role)}</Badge>
                      </TableCell>
                      <TableCell className="flex justify-center">
                        {assoc.isDefault ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(assoc as any).createdAt ? (
                          <div className="flex flex-col text-xs">
                            <span>
                              {format(new Date((assoc as any).createdAt), 'MMM dd, yyyy')}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date((assoc as any).createdAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(assoc as any).updatedAt ? (
                          <div className="flex flex-col text-xs">
                            <span>
                              {format(new Date((assoc as any).updatedAt), 'MMM dd, yyyy')}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date((assoc as any).updatedAt), 'hh:mm a')}
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingAssoc(assoc);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setDeletingId(assoc.id);
                              setIsDeleteDialogOpen(true);
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
        </div>
      </CardContent>

      <AssociationFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        association={editingAssoc}
        tenants={tenants}
        users={users}
        onSave={handleSave}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Association"
        description="Are you sure you want to remove this user from the tenant?"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
        variant="destructive"
      />
    </Card>
  );
}

function AssociationFormDialog({
  open,
  onOpenChange,
  association,
  tenants,
  users,
  onSave,
  isLoading,
}: any) {
  const [formData, setFormData] = useState({
    userId: '',
    tenantId: '',
    role: 'ADJUSTER',
    isDefault: false,
  });

  useEffect(() => {
    if (association) {
      setFormData({
        userId: association.userId,
        tenantId: association.tenantId,
        role: association.role,
        isDefault: association.isDefault,
      });
    } else {
      setFormData({ userId: '', tenantId: '', role: 'ADJUSTER', isDefault: false });
    }
  }, [association, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{association ? 'Edit Association' : 'Add Association'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>User</Label>
            <Select
              value={formData.userId}
              onValueChange={v => setFormData({ ...formData, userId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select User" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tenant</Label>
            <Select
              value={formData.tenantId}
              onValueChange={v => setFormData({ ...formData, tenantId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={formData.role}
              onValueChange={v => setFormData({ ...formData, role: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADJUSTER">Adjuster</SelectItem>
                <SelectItem value="FIRM_ADMIN">Firm Admin</SelectItem>
                <SelectItem value="CLAIMANT">Claimant</SelectItem>
                <SelectItem value="INSURER_STAFF">Insurer Staff</SelectItem>
                <SelectItem value="INSURER_ADMIN">Insurer Admin</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                <SelectItem value="SIU_INVESTIGATOR">SIU Investigator</SelectItem>
                <SelectItem value="COMPLIANCE_OFFICER">Compliance Officer</SelectItem>
                <SelectItem value="SUPPORT_DESK">Support Desk</SelectItem>
                <SelectItem value="SHARIAH_REVIEWER">Shariah Reviewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="isDefault">Set as Default Tenant</Label>
            <Switch
              id="isDefault"
              checked={formData.isDefault}
              onCheckedChange={v => setFormData({ ...formData, isDefault: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onSave(formData)} disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
