import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { MapPin, Navigation, Phone, Star, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedCard from './AnimatedCard';
import GradientButton from './GradientButton';
import LoadingSpinner from './LoadingSpinner';

interface Store {
  name: string;
  address: string;
  distance: number;
  type: 'grocery' | 'restaurant';
  rating?: number;
  phone?: string;
}

interface LocationPickerProps {
  visible: boolean;
  onClose: () => void;
  type: 'grocery' | 'restaurant';
  onStoreSelect?: (store: Store) => void;
}

const LocationPicker: React.FC<LocationPickerProps> = ({
  visible,
  onClose,
  type,
  onStoreSelect,
}) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [locationPermission, setLocationPermission] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      loadNearbyStores();
    }
  }, [visible, type]);

  const loadNearbyStores = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Mock data for web
        setStores(getMockStores(type));
        setLocationPermission(true);
        setLoading(false);
        return;
      }
      
      // In a real app, this would use actual location services
      // For now, we'll simulate location data
      setCurrentLocation({
        latitude: 37.7749,
        longitude: -122.4194,
        address: '123 Main St, San Francisco, CA'
      });
      setLocationPermission(true);
      setStores(getMockStores(type));
    } catch (error) {
      console.error('Error loading nearby stores:', error);
      setLocationPermission(false);
      // Fallback to mock data
      setStores(getMockStores(type));
    } finally {
      setLoading(false);
    }
  };

  const getMockStores = (storeType: 'grocery' | 'restaurant'): Store[] => {
    if (storeType === 'grocery') {
      return [
        {
          name: 'Whole Foods Market',
          address: '123 Main St, Your City',
          distance: 0.8,
          type: 'grocery',
          rating: 4.5,
          phone: '(555) 123-4567'
        },
        {
          name: 'Safeway',
          address: '456 Oak Ave, Your City',
          distance: 1.2,
          type: 'grocery',
          rating: 4.2,
          phone: '(555) 234-5678'
        },
        {
          name: 'Trader Joe\'s',
          address: '789 Pine St, Your City',
          distance: 1.5,
          type: 'grocery',
          rating: 4.7,
          phone: '(555) 345-6789'
        }
      ];
    } else {
      return [
        {
          name: 'Local Italian Bistro',
          address: '321 Elm St, Your City',
          distance: 0.5,
          type: 'restaurant',
          rating: 4.8,
          phone: '(555) 456-7890'
        },
        {
          name: 'Taco Express',
          address: '654 Maple Dr, Your City',
          distance: 0.9,
          type: 'restaurant',
          rating: 4.3,
          phone: '(555) 567-8901'
        }
      ];
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'web') {
      setLocationPermission(true);
      setStores(getMockStores(type));
      return;
    }
    
    // In a real app, this would request actual permissions
    setLocationPermission(true);
    loadNearbyStores();
  };

  const openInMaps = async (store: Store) => {
    if (Platform.OS === 'web') {
      window.open(`https://maps.google.com/maps?q=${encodeURIComponent(store.address)}`, '_blank');
      return;
    }
    
    // In a real app, this would open the maps app
    const url = `https://maps.google.com/maps?q=${encodeURIComponent(store.address)}`;
    const canOpen = await Linking.canOpenURL(url);
    
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  const callStore = (phone: string) => {
    if (Platform.OS !== 'web') {
      Linking.openURL(`tel:${phone}`);
    } else {
      window.open(`tel:${phone}`);
    }
  };

  const handleStoreSelect = (store: Store) => {
    onStoreSelect?.(store);
    onClose();
  };

  const getStoreIcon = () => {
    return type === 'grocery' ? '🛒' : '🍽️';
  };

  const getTitle = () => {
    return type === 'grocery' ? 'Nearby Grocery Stores' : 'Nearby Restaurants';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <LinearGradient colors={['#FF6B35', '#F7931E']} style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerIcon}>{getStoreIcon()}</Text>
              <Text style={styles.headerTitle}>{getTitle()}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <X size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
          {currentLocation?.address && (
            <Text style={styles.currentLocation}>
              📍 {currentLocation.address}
            </Text>
          )}
        </LinearGradient>

        {loading ? (
          <View style={styles.loadingContainer}>
            <LoadingSpinner size={60} color="#FF6B35" />
            <Text style={styles.loadingText}>Finding nearby {type === 'grocery' ? 'stores' : 'restaurants'}...</Text>
          </View>
        ) : !locationPermission ? (
          <View style={styles.permissionContainer}>
            <AnimatedCard style={styles.permissionCard}>
              <MapPin size={60} color="#FF6B35" />
              <Text style={styles.permissionTitle}>Location Access Needed</Text>
              <Text style={styles.permissionText}>
                We need your location to find nearby {type === 'grocery' ? 'grocery stores' : 'restaurants'} and help you plan your shopping trips.
              </Text>
              <GradientButton
                title="Enable Location"
                onPress={requestLocationPermission}
                style={styles.permissionButton}
              />
            </AnimatedCard>
          </View>
        ) : (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {stores.length === 0 ? (
              <AnimatedCard style={styles.emptyContainer}>
                <MapPin size={60} color="#CCC" />
                <Text style={styles.emptyTitle}>No {type === 'grocery' ? 'Stores' : 'Restaurants'} Found</Text>
                <Text style={styles.emptySubtitle}>
                  We couldn't find any nearby {type === 'grocery' ? 'grocery stores' : 'restaurants'}. Try expanding your search area.
                </Text>
              </AnimatedCard>
            ) : (
              stores.map((store, index) => (
                <AnimatedCard key={index} style={styles.storeCard}>
                  <View style={styles.storeHeader}>
                    <View style={styles.storeInfo}>
                      <Text style={styles.storeName}>{store.name}</Text>
                      <Text style={styles.storeAddress}>{store.address}</Text>
                      <View style={styles.storeDetails}>
                        <View style={styles.distanceContainer}>
                          <Navigation size={14} color="#666" />
                          <Text style={styles.distance}>{store.distance.toFixed(1)} mi</Text>
                        </View>
                        {store.rating && (
                          <View style={styles.ratingContainer}>
                            <Star size={14} color="#FFD700" />
                            <Text style={styles.rating}>{store.rating}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.storeActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => openInMaps(store)}
                    >
                      <MapPin size={16} color="#FF6B35" />
                      <Text style={styles.actionText}>Directions</Text>
                    </TouchableOpacity>

                    {store.phone && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => callStore(store.phone!)}
                      >
                        <Phone size={16} color="#FF6B35" />
                        <Text style={styles.actionText}>Call</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionButton, styles.selectButton]}
                      onPress={() => handleStoreSelect(store)}
                    >
                      <Text style={styles.selectText}>Select</Text>
                    </TouchableOpacity>
                  </View>
                </AnimatedCard>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 40 : 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentLocation: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#FFE5D9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  permissionCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  permissionButton: {
    minWidth: 180,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  storeCard: {
    marginBottom: 15,
  },
  storeHeader: {
    marginBottom: 15,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 4,
  },
  storeAddress: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginBottom: 8,
  },
  storeDetails: {
    flexDirection: 'row',
    gap: 15,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distance: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
  },
  storeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#FF6B35',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FF6B35',
  },
  selectButton: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  selectText: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
});

export default LocationPicker;