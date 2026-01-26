import { useState } from 'react';
import { Plus, Loader2, ChevronLeft, ChevronRight, Database, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
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
import { Input } from '@/components/ui/input';
import {
  useVehicleMakes,
  useCreateVehicleMake,
  useUpdateVehicleMake,
  useDeleteVehicleMake,
  VehicleMake,
} from '@/hooks/use-master-data';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { InfoTooltip } from '@/components/ui/tooltip';

export function VehicleMakePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMakeDialogOpen, setIsMakeDialogOpen] = useState(false);
  const [newMakeName, setNewMakeName] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMake, setEditingMake] = useState<VehicleMake | null>(null);
  const [editMakeName, setEditMakeName] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingMakeId, setDeletingMakeId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const limit = 10;

  const { toast } = useToast();
  const { data: makes, isLoading: isLoadingMakes } = useVehicleMakes();
  const createMakeMutation = useCreateVehicleMake();
  const updateMakeMutation = useUpdateVehicleMake();
  const deleteMakeMutation = useDeleteVehicleMake();

  const handleCreateMake = async () => {
    if (!newMakeName.trim()) return;
    try {
      await createMakeMutation.mutateAsync(newMakeName);
      toast({ title: 'Success', description: 'Vehicle make created successfully' });
      setNewMakeName('');
      setIsMakeDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create vehicle make',
        variant: 'destructive',
      });
    }
  };

  const handleEditClick = (make: VehicleMake) => {
    setEditingMake(make);
    setEditMakeName(make.name);
    setIsEditDialogOpen(true);
  };

  const handleUpdateMake = async () => {
    if (!editingMake || !editMakeName.trim()) return;
    try {
      await updateMakeMutation.mutateAsync({ id: editingMake.id, name: editMakeName });
      toast({ title: 'Success', description: 'Vehicle make updated successfully' });
      setIsEditDialogOpen(false);
      setEditingMake(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update vehicle make',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeletingMakeId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingMakeId) return;
    try {
      await deleteMakeMutation.mutateAsync(deletingMakeId);
      toast({ title: 'Success', description: 'Vehicle make deleted successfully' });
      setIsDeleteDialogOpen(false);
      setDeletingMakeId(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete vehicle make',
        variant: 'destructive',
      });
    }
  };

  const filteredMakes =
    makes?.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  // Pagination
  const totalPages = Math.ceil(filteredMakes.length / limit);
  const paginatedMakes = filteredMakes.slice((page - 1) * limit, page * limit);

  return (
    <div className="flex flex-col h-full">
      <Header title="Vehicle Makes" description="Manage vehicle manufacturers">
        <Dialog open={isMakeDialogOpen} onOpenChange={setIsMakeDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-primary/20 shadow-lg -mr-3 scale-75">
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Vehicle Make</DialogTitle>
              <DialogDescription>Create a new vehicle manufacturer entry.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Make Name</Label>
                <Input
                  placeholder="e.g. Toyota"
                  value={newMakeName}
                  onChange={e => setNewMakeName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsMakeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateMake} disabled={createMakeMutation.isPending}>
                {createMakeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search makes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-[280px]"
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="space-y-4 transition-all duration-300">
          {isLoadingMakes ? (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={4}>
                      <Skeleton className="h-4 w-full" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24 mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Skeleton className="h-4 w-24 mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Skeleton className="h-8 w-16" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : paginatedMakes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No makes found</p>
              <p className="text-sm">Try adjusting your search</p>
            </div>
          ) : (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Created</TableHead>
                    <TableHead className="text-center">Updated</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {paginatedMakes.map(make => (
                    <TableRow key={make.id} className="hover:bg-accent/50">
                      <TableCell className="font-medium">{make.name}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col text-xs">
                          <span>
                            {format(new Date(make.createdAt || new Date()), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(make.createdAt || new Date()), 'hh:mm a')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col text-xs">
                          <span>
                            {format(new Date(make.updatedAt || new Date()), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(make.updatedAt || new Date()), 'hh:mm a')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <InfoTooltip
                            content="Edit"
                            direction="top"
                            fontSize="text-[11px]"
                            trigger={
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-foreground hover:bg-accent"
                                onClick={() => handleEditClick(make)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            }
                          />
                          <InfoTooltip
                            content="Delete"
                            direction="top"
                            fontSize="text-[11px]"
                            trigger={
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-foreground hover:bg-accent"
                                onClick={() => handleDeleteClick(make.id)}
                                disabled={deleteMakeMutation.isPending}
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

          {/* Pagination */}
          {!isLoadingMakes && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <EditMakeDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        make={editingMake}
        newName={editMakeName}
        setNewName={setEditMakeName}
        onSave={handleUpdateMake}
        isLoading={updateMakeMutation.isPending}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Vehicle Make"
        description="Are you sure you want to delete this vehicle make? This action cannot be undone and may affect associated models."
        onConfirm={handleConfirmDelete}
        confirmText="Delete"
        variant="destructive"
        isLoading={deleteMakeMutation.isPending}
      />
    </div>
  );
}

function EditMakeDialog({
  open,
  onOpenChange,
  make,
  newName,
  setNewName,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  make: VehicleMake | null;
  newName: string;
  setNewName: (name: string) => void;
  onSave: () => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Vehicle Make</DialogTitle>
          <DialogDescription>Update the name of the vehicle manufacturer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Make Name</Label>
            <Input
              placeholder="e.g. Toyota"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
