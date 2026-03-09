import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { format } from 'date-fns';
import {
  Building2,
  Users,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Network,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { SearchInput } from '@/components/ui/search-input';
import { useDebounce } from '@/hooks/use-debounce';
import { InfoTooltip } from '@/components/ui';
import { useLayout } from '@/components/layout';

export function TenantsPage() {
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenantsPage, setTenantsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [userTenantsPage, setUserTenantsPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 400);
  const limit = 10;

  const { toast } = useToast();
  const { isMobile, currentWidth } = useLayout();

  const tenantsTableRef = useRef<any>(null);
  const usersTableRef = useRef<any>(null);
  const associationsTableRef = useRef<any>(null);

  const { data: tenantsData, isLoading: isLoadingTenants } = useTenants({
    page: tenantsPage,
    limit,
    search: debouncedSearch,
  });
  const { data: usersData, isLoading: isLoadingUsers } = useUsers({
    page: usersPage,
    limit,
    search: debouncedSearch,
  });
  const { data: userTenantsData, isLoading: isLoadingUserTenants } = useUserTenants({
    page: userTenantsPage,
    limit,
    search: debouncedSearch,
  });

  // Reset pages and search when tab changes
  useEffect(() => {
    setTenantsPage(1);
    setUsersPage(1);
    setUserTenantsPage(1);
    // setSearchQuery('');
  }, [activeTab]);

  // Reset pages when search query changes
  useEffect(() => {
    setTenantsPage(1);
    setUsersPage(1);
    setUserTenantsPage(1);
  }, [debouncedSearch]);

  const tenants = tenantsData?.tenants || [];
  const tenantsPagination = tenantsData?.pagination;
  const users = usersData?.users || [];
  const usersPagination = usersData?.pagination;
  const userTenants = userTenantsData?.userTenants || [];
  const userTenantsPagination = userTenantsData?.pagination;

  // Selection data for dropdowns
  const { data: selectionTenantsData } = useTenants({ limit: 10 });
  const { data: selectionUsersData } = useUsers({ limit: 10 });
  const selectionTenants = selectionTenantsData?.tenants || [];
  const selectionUsers = selectionUsersData?.users || [];

  const tabs = [
    { id: 'tenants', label: 'Tenants', icon: Building2, count: tenantsPagination?.total || 0 },
    { id: 'users', label: 'Users', icon: Users, count: usersPagination?.total || 0 },
    {
      id: 'associations',
      label: 'Associations',
      icon: Network,
      count: userTenantsPagination?.total || 0,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50">
      <Header title="Tenants" description="Manage tenants, users and their associations">
        <Button
          className="shadow-primary/20 shadow-lg -mr-3 scale-75"
          onClick={() => {
            if (activeTab === 'tenants') tenantsTableRef.current?.handleCreate();
            if (activeTab === 'users') usersTableRef.current?.handleCreate();
            if (activeTab === 'associations') associationsTableRef.current?.handleCreate();
          }}
        >
          <Plus className="h-4 w-4 mr-0 sm:mr-2" />
          {currentWidth > 430 ? 'New' : ''}
        </Button>
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder={isMobile ? 'Search' : `Search ${activeTab}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={isMobile ? 'w-[120px]' : 'w-[280px]'}
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto space-y-6">
          {/* Horizontal Tabs */}
          <div
            data-horizontal="true"
            className="flex items-center border-b border-border overflow-hidden overflow-x-auto whitespace-nowrap custom-scrollbar"
          >
            <div className="flex gap-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 mx-1 font-medium text-sm transition-all border-b-2 -mb-[1px] flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {/* <tab.icon className="h-4 w-4" /> */}
                  {tab.label} ({tab?.count || 0})
                </button>
              ))}
            </div>
          </div>

          <main>
            {activeTab === 'tenants' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <TenantsTable
                  ref={tenantsTableRef}
                  tenants={tenants}
                  allTenants={selectionTenants}
                  isLoading={isLoadingTenants}
                  pagination={tenantsPagination}
                  page={tenantsPage}
                  onPageChange={setTenantsPage}
                  onRefresh={() => {}}
                />
              </div>
            )}

            {activeTab === 'users' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <UsersTable
                  ref={usersTableRef}
                  users={users}
                  allUsers={selectionUsers}
                  isLoading={isLoadingUsers}
                  pagination={usersPagination}
                  page={usersPage}
                  onPageChange={setUsersPage}
                  onRefresh={() => {}}
                />
              </div>
            )}

            {activeTab === 'associations' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <UserTenantsTable
                  ref={associationsTableRef}
                  associations={userTenants}
                  tenants={selectionTenants}
                  users={selectionUsers}
                  isLoading={isLoadingUserTenants}
                  pagination={userTenantsPagination}
                  page={userTenantsPage}
                  onPageChange={setUserTenantsPage}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

const TenantsTable = forwardRef(
  (
    {
      tenants,
      allTenants,
      isLoading,
      pagination,
      page,
      onPageChange,
    }: {
      tenants: Tenant[];
      allTenants: Tenant[];
      isLoading: boolean;
      pagination?: any;
      page: number;
      onPageChange: (page: number) => void;
      onRefresh: () => void;
    },
    ref
  ) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const createMutation = useCreateTenant();
    const updateMutation = useUpdateTenant();
    const deleteMutation = useDeleteTenant();
    const { toast } = useToast();

    useImperativeHandle(ref, () => ({
      handleCreate: () => {
        setEditingTenant(null);
        setIsDialogOpen(true);
      },
    }));

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
      <>
        {/* <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Organization Tenants</CardTitle>
              <CardDescription>View and manage all active tenants in the system.</CardDescription>
            </div>
          </CardHeader>
        </Card> */}

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
                          <InfoTooltip
                            content="Edit"
                            direction="top"
                            fontSize="text-[11px]"
                            trigger={
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setEditingTenant(tenant);
                                  setIsDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <InfoTooltip
                            content="Delete"
                            direction="top"
                            fontSize="text-[11px]"
                            trigger={
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setDeletingId(tenant.id);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              Page {page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <TenantFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          tenant={editingTenant}
          tenants={allTenants}
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
      </>
    );
  }
);

function TenantFormDialog({ open, onOpenChange, tenant, tenants, onSave, isLoading }: any) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'INSURER',
    subscriptionTier: 'BASIC',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    setErrors({});
  }, [tenant, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) {
      errs.name = 'Tenant name is required.';
    } else if (
      tenants.some(
        (t: any) =>
          t.name.toLowerCase() === formData.name.trim().toLowerCase() && t.id !== tenant?.id
      )
    ) {
      errs.name = 'A tenant with this name already exists.';
    }
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tenant ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              Tenant Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.name}
              onChange={e => {
                setFormData({ ...formData, name: e.target.value });
                setErrors(p => ({ ...p, name: '' }));
              }}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
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
          <Button onClick={handleSubmit} disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const UsersTable = forwardRef(
  (
    {
      users,
      allUsers,
      isLoading,
      pagination,
      page,
      onPageChange,
    }: {
      users: User[];
      allUsers: User[];
      isLoading: boolean;
      pagination?: any;
      page: number;
      onPageChange: (page: number) => void;
      onRefresh: () => void;
    },
    ref
  ) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const createMutation = useCreateUser();
    const updateMutation = useUpdateUser();
    const deleteMutation = useDeleteUser();
    const { toast } = useToast();

    useImperativeHandle(ref, () => ({
      handleCreate: () => {
        setEditingUser(null);
        setIsDialogOpen(true);
      },
    }));

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
      <>
        {/* <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>System Users</CardTitle>
              <CardDescription>View and manage all registered users in the system.</CardDescription>
            </div>
          </CardHeader>
        </Card> */}

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
                    <TableHead className="text-center">Verified</TableHead>
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
                      <TableCell className="flex justify-center m-2">
                        {user.isVerified ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
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
                            size="xs"
                            onClick={() => {
                              setEditingUser(user);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
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

        {/* Pagination */}
        {!isLoading && pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              Page {page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <UserFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          user={editingUser}
          users={allUsers}
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
      </>
    );
  }
);

function UserFormDialog({ open, onOpenChange, user, users, onSave, isLoading }: any) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        password: '',
      });
    } else {
      setFormData({ fullName: '', email: '', phoneNumber: '', password: '' });
    }
    setErrors({});
  }, [user, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!formData.email.trim()) {
      errs.email = 'Email is required.';
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) {
      errs.email = 'Enter a valid email address.';
    } else if (
      users.some(
        (u: any) =>
          u.email.toLowerCase() === formData.email.trim().toLowerCase() && u.id !== user?.id
      )
    ) {
      errs.email = 'A user with this email already exists.';
    }
    if (!formData.phoneNumber.trim()) errs.phoneNumber = 'Phone number is required.';
    if (!user && !formData.password) errs.password = 'Password is required.';
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave(formData);
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(p => ({ ...p, [field]: e.target.value }));
    setErrors(p => ({ ...p, [field]: '' }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user ? 'Edit User' : 'Add User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.fullName}
              onChange={set('fullName')}
              className={errors.fullName ? 'border-destructive' : ''}
            />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
          </div>
          <div className="space-y-2">
            <Label>Email {!user && <span className="text-destructive">*</span>}</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={set('email')}
              readOnly={!!user}
              className={`${errors.email ? 'border-destructive' : ''} ${user ? 'bg-muted/50 cursor-not-allowed' : ''}`}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label>
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.phoneNumber}
              onChange={set('phoneNumber')}
              className={errors.phoneNumber ? 'border-destructive' : ''}
            />
            {errors.phoneNumber && <p className="text-xs text-destructive">{errors.phoneNumber}</p>}
          </div>
          {!user && (
            <div className="space-y-2">
              <Label>
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                value={formData.password}
                onChange={set('password')}
                className={errors.password ? 'border-destructive' : ''}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const UserTenantsTable = forwardRef(
  (
    {
      associations,
      tenants,
      users,
      isLoading,
      pagination,
      page,
      onPageChange,
    }: {
      associations: UserTenant[];
      tenants: Tenant[];
      users: User[];
      isLoading: boolean;
      pagination?: any;
      page: number;
      onPageChange: (page: number) => void;
    },
    ref
  ) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingAssoc, setEditingAssoc] = useState<UserTenant | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const createMutation = useCreateUserTenant();
    const updateMutation = useUpdateUserTenant();
    const deleteMutation = useDeleteUserTenant();
    const { toast } = useToast();

    useImperativeHandle(ref, () => ({
      handleCreate: () => {
        setEditingAssoc(null);
        setIsDialogOpen(true);
      },
    }));

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
        toast({
          title: 'Error',
          description: 'Failed to save association',
          variant: 'destructive',
        });
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
      <>
        {/* <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>User-Tenant Associations</CardTitle>
              <CardDescription>Manage which users belong to which tenants.</CardDescription>
            </div>
          </CardHeader>
        </Card> */}

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
                      <TableCell className="flex justify-center m-2">
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
                            size="xs"
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
                            size="xs"
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

        {/* Pagination */}
        {!isLoading && pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              Page {page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(pagination.totalPages, page + 1))}
              disabled={page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <AssociationFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          association={editingAssoc}
          associations={associations}
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
      </>
    );
  }
);

function AssociationFormDialog({
  open,
  onOpenChange,
  association,
  associations,
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
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    setErrors({});
  }, [association, open]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.userId) errs.userId = 'Please select a user.';
    if (!formData.tenantId) errs.tenantId = 'Please select a tenant.';

    if (formData.userId && formData.tenantId) {
      const exists = associations.some(
        (a: any) =>
          a.userId === formData.userId &&
          a.tenantId === formData.tenantId &&
          a.id !== association?.id
      );
      if (exists) {
        errs.tenantId = 'This user is already associated with this tenant.';
      }
    }

    if (formData.isDefault && formData.userId) {
      const otherDefault = associations.find(
        (a: any) => a.userId === formData.userId && a.isDefault && a.id !== association?.id
      );
      if (otherDefault) {
        errs.isDefault = `This user already has a default tenant assigned (${otherDefault.tenant.name}).`;
      }
    }
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{association ? 'Edit Association' : 'Add Association'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              User <span className="text-destructive">*</span>
            </Label>
            <Select
              disabled={!!association}
              value={formData.userId}
              onValueChange={v => {
                setFormData({ ...formData, userId: v });
                setErrors(p => ({ ...p, userId: '' }));
              }}
            >
              <SelectTrigger className={errors.userId ? 'border-destructive' : ''}>
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
            {errors.userId && <p className="text-xs text-destructive">{errors.userId}</p>}
          </div>
          <div className="space-y-2">
            <Label>
              Tenant <span className="text-destructive">*</span>
            </Label>
            <Select
              disabled={!!association}
              value={formData.tenantId}
              onValueChange={v => {
                setFormData({ ...formData, tenantId: v });
                setErrors(p => ({ ...p, tenantId: '' }));
              }}
            >
              <SelectTrigger className={errors.tenantId ? 'border-destructive' : ''}>
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
            {errors.tenantId && <p className="text-xs text-destructive">{errors.tenantId}</p>}
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
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                <SelectItem value="SIU_INVESTIGATOR">SIU Investigator</SelectItem>
                <SelectItem value="COMPLIANCE_OFFICER">Compliance Officer</SelectItem>
                <SelectItem value="SUPPORT_DESK">Support Desk</SelectItem>
                <SelectItem value="SHARIAH_REVIEWER">Shariah Reviewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="isDefault">Set as Default Tenant</Label>
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={v => {
                  setFormData({ ...formData, isDefault: v });
                  setErrors(p => ({ ...p, isDefault: '' }));
                }}
              />
            </div>
            {errors.isDefault && <p className="text-xs text-destructive">{errors.isDefault}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
