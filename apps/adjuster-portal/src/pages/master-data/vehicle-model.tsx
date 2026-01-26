import { useState } from 'react';
import { Plus, Loader2, ChevronLeft, ChevronRight, Car, Pencil, Trash2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useVehicleMakes,
  useVehicleModels,
  useCreateVehicleModel,
  useUpdateVehicleModel,
  useDeleteVehicleModel,
  VehicleModel,
} from '@/hooks/use-master-data';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { InfoTooltip } from '@/components/ui/tooltip';

export function VehicleModelPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMakeId, setSelectedMakeId] = useState<string>('');
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<VehicleModel | null>(null);
  const [editModelName, setEditModelName] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingModel, setDeletingModel] = useState<VehicleModel | null>(null);

  const [page, setPage] = useState(1);
  const limit = 10;

  const { toast } = useToast();
  const { data: makes, isLoading: isLoadingMakes } = useVehicleMakes();
  const { data: models, isLoading: isLoadingModels } = useVehicleModels(selectedMakeId);
  const createModelMutation = useCreateVehicleModel();
  const updateModelMutation = useUpdateVehicleModel();
  const deleteModelMutation = useDeleteVehicleModel();

  const handleCreateModel = async () => {
    if (!newModelName.trim() || !selectedMakeId) return;
    try {
      await createModelMutation.mutateAsync({ name: newModelName, makeId: selectedMakeId });
      toast({ title: 'Success', description: 'Vehicle model created successfully' });
      setNewModelName('');
      setIsModelDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create vehicle model',
        variant: 'destructive',
      });
    }
  };

  const handleEditClick = (model: VehicleModel) => {
    setEditingModel(model);
    setEditModelName(model.name);
    setIsEditDialogOpen(true);
  };

  const handleUpdateModel = async () => {
    if (!editingModel || !editModelName.trim()) return;
    try {
      await updateModelMutation.mutateAsync({
        id: editingModel.id,
        name: editModelName,
        makeId: editingModel.makeId,
      });
      toast({ title: 'Success', description: 'Vehicle model updated successfully' });
      setIsEditDialogOpen(false);
      setEditingModel(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update vehicle model',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (model: VehicleModel) => {
    setDeletingModel(model);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingModel) return;
    try {
      await deleteModelMutation.mutateAsync({
        id: deletingModel.id,
        makeId: deletingModel.makeId,
      });
      toast({ title: 'Success', description: 'Vehicle model deleted successfully' });
      setIsDeleteDialogOpen(false);
      setDeletingModel(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete vehicle model',
        variant: 'destructive',
      });
    }
  };

  const filteredModels =
    models?.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];

  // Pagination
  const totalPages = Math.ceil(filteredModels.length / limit);
  const paginatedModels = filteredModels.slice((page - 1) * limit, page * limit);
  const selectedMakeName = makes?.find(m => m.id === selectedMakeId)?.name;

  return (
    <div className="flex flex-col h-full">
      <Header title="Vehicle Models" description="Manage vehicle models by manufacturer">
        <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
          <DialogTrigger asChild>
            <Button
              disabled={!selectedMakeId}
              className="shadow-primary/20 shadow-lg -mr-3 scale-75"
            >
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Vehicle Model</DialogTitle>
              <DialogDescription>
                Create a new vehicle model for {selectedMakeName || 'the selected make'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Model Name</Label>
                <Input
                  placeholder="e.g. Camry"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModelDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateModel} disabled={createModelMutation.isPending}>
                {createModelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-[280px]"
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Make Selector */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Filter by Make:</Label>
          <Select value={selectedMakeId} onValueChange={setSelectedMakeId}>
            <SelectTrigger className="w-[250px] bg-card">
              <SelectValue placeholder="Select a vehicle make" />
            </SelectTrigger>
            <SelectContent>
              {makes?.map(make => (
                <SelectItem key={make.id} value={make.id}>
                  {make.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4 transition-all duration-300">
          {isLoadingModels ? (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={5}>
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
                        <Skeleton className="h-4 w-20" />
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
          ) : !selectedMakeId ? (
            <div className="text-center py-12 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a make to view models</p>
              <p className="text-sm">Choose a vehicle manufacturer from the dropdown above</p>
            </div>
          ) : paginatedModels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No models found</p>
              <p className="text-sm">Try adjusting your search or add a new model</p>
            </div>
          ) : (
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Make</TableHead>
                    <TableHead className="text-center">Created</TableHead>
                    <TableHead className="text-center">Updated</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-card">
                  {paginatedModels.map(model => (
                    <TableRow key={model.id} className="hover:bg-accent/50">
                      <TableCell className="font-medium">{model.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{selectedMakeName}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col text-xs">
                          <span>
                            {format(new Date(model.createdAt || new Date()), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(model.createdAt || new Date()), 'hh:mm a')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col text-xs">
                          <span>
                            {format(new Date(model.updatedAt || new Date()), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(model.updatedAt || new Date()), 'hh:mm a')}
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
                                onClick={() => handleEditClick(model)}
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
                                onClick={() => handleDeleteClick(model)}
                                disabled={deleteModelMutation.isPending}
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
          {!isLoadingModels && selectedMakeId && totalPages > 1 && (
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

      <EditModelDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        model={editingModel}
        newName={editModelName}
        setNewName={setEditModelName}
        onSave={handleUpdateModel}
        isLoading={updateModelMutation.isPending}
        makeName={selectedMakeName}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Vehicle Model"
        description={
          <span>
            Are you sure you want to delete the model <b>{deletingModel?.name}</b>? This action
            cannot be undone.
          </span>
        }
        onConfirm={handleConfirmDelete}
        confirmText="Delete"
        variant="destructive"
        isLoading={deleteModelMutation.isPending}
      />
    </div>
  );
}

function EditModelDialog({
  open,
  onOpenChange,
  model,
  newName,
  setNewName,
  onSave,
  isLoading,
  makeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: VehicleModel | null;
  newName: string;
  setNewName: (name: string) => void;
  onSave: () => void;
  isLoading: boolean;
  makeName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Vehicle Model</DialogTitle>
          <DialogDescription>
            Update the name of the vehicle model for {makeName}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Model Name</Label>
            <Input
              placeholder="e.g. Camry"
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
