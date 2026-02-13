import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Camera, X, Check, Upload, Scan } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import ApiService from '@/services/ApiService';
import { useAppContext } from '@/contexts/AppContext';
import GradientButton from './GradientButton';
import LoadingSpinner from './LoadingSpinner';
import AnimatedCard from './AnimatedCard';

interface ReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  category?: string;
}

interface ReceiptScannerProps {
  visible: boolean;
  onClose: () => void;
  onReceiptProcessed: (suggestions: string[], newPlan?: any[]) => void;
}

const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  visible,
  onClose,
  onReceiptProcessed,
}) => {
  const { currentMealPlan, userProfile } = useAppContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedItems, setScannedItems] = useState<ReceiptItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const scanAnimation = useSharedValue(0);
  const pulseAnimation = useSharedValue(1);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: scanAnimation.value * 200, // Scan area height
      },
    ],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnimation.value }],
  }));

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.permissionContainer}>
          <Camera size={80} color="#FF6B35" />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan your grocery receipts and optimize your meal plans.
          </Text>
          <GradientButton
            title="Grant Permission"
            onPress={requestPermission}
            style={styles.permissionButton}
          />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo) {
        await processReceiptImage(photo.uri);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      setErrorMessage('Failed to capture image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const pickImage = async () => {
    try {
      setErrorMessage(null);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsProcessing(true);
        await processReceiptImage(result.assets[0].uri);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setErrorMessage('Failed to select image. Please try again.');
      setIsProcessing(false);
    }
  };

  const processReceiptImage = async (imageUri: string) => {
    try {
      // Simulate OCR processing - in production, this would use actual OCR
      const mockReceiptItems: ReceiptItem[] = [
        { name: 'Chicken Breast', price: 8.99, quantity: 2, category: 'meat' },
        { name: 'Pasta', price: 1.99, quantity: 1, category: 'pantry' },
        { name: 'Tomatoes', price: 2.49, quantity: 1, category: 'produce' },
        { name: 'Garlic', price: 0.99, quantity: 1, category: 'produce' },
        { name: 'Olive Oil', price: 4.99, quantity: 1, category: 'pantry' },
        { name: 'Parmesan Cheese', price: 5.99, quantity: 1, category: 'dairy' },
      ];

      setScannedItems(mockReceiptItems);
      setShowResults(true);

      // Process with backend if connected
      if (userProfile && apiConnected) {
        try {
          const response = await ApiService.processReceipt({
            items: mockReceiptItems,
            user_profile_id: userProfile.id || 1,
            current_meal_plan: currentMealPlan.map(meal => ({
              day: meal.day,
              meal: meal.meal,
              cook_time: meal.cookTime,
              cost: meal.cost,
              ingredients: meal.ingredients,
            })),
          });

          onReceiptProcessed(response.suggestions, response.new_meal_plan);
        } catch (error) {
          console.error('Failed to process receipt with API:', error);
          setErrorMessage('Failed to process receipt online. Using offline analysis.');
          // Fallback to local processing
          const localSuggestions = generateLocalSuggestions(mockReceiptItems);
          onReceiptProcessed(localSuggestions);
        }
      } else {
        // Local processing when offline
        const localSuggestions = generateLocalSuggestions(mockReceiptItems);
        onReceiptProcessed(localSuggestions);
      }
    } catch (error) {
      console.error('Error processing receipt:', error);
      setErrorMessage('Failed to process receipt. Please try again.');
    }
  };

  const generateLocalSuggestions = (items: ReceiptItem[]): string[] => {
    const suggestions = [];
    const totalCost = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    
    suggestions.push(`📄 Receipt processed: ${items.length} items, $${totalCost.toFixed(2)} total`);
    
    // Check for common ingredients
    const hasChicken = items.some(item => item.name.toLowerCase().includes('chicken'));
    const hasPasta = items.some(item => item.name.toLowerCase().includes('pasta'));
    
    if (hasChicken && hasPasta) {
      suggestions.push('🍝 Perfect! You can make Chicken Pasta with these ingredients');
    } else if (hasChicken) {
      suggestions.push('🌮 Consider making Chicken Tacos or Stir Fry');
    } else if (hasPasta) {
      suggestions.push('🍝 Great for pasta dishes - try Garlic Pasta or Marinara');
    }
    
    suggestions.push('💡 Tip: You saved ~$15 vs ordering takeout!');
    
    return suggestions;
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const dismissError = () => {
    setErrorMessage(null);
  };

  if (showResults) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.resultsContainer}>
          <LinearGradient colors={['#FF6B35', '#F7931E']} style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>Receipt Scanned! 📄</Text>
            <Text style={styles.resultsSubtitle}>
              Found {scannedItems.length} items
              {!apiConnected && ' • Processed Offline'}
            </Text>
          </LinearGradient>

          <ScrollView style={styles.itemsList}>
            {scannedItems.map((item, index) => (
              <View key={index} style={styles.receiptItem}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                </View>
                <View style={styles.itemPrice}>
                  <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
                  {item.quantity && item.quantity > 1 && (
                    <Text style={styles.quantityText}>x{item.quantity}</Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.resultsActions}>
            <TouchableOpacity
              style={styles.scanAgainButton}
              onPress={() => {
                setShowResults(false);
                setScannedItems([]);
                setErrorMessage(null);
              }}
            >
              <Scan size={20} color="#FF6B35" />
              <Text style={styles.scanAgainText}>Scan Another</Text>
            </TouchableOpacity>

            <GradientButton
              title="Apply to Meal Plan"
              onPress={onClose}
              icon={<Check size={20} color="#FFF" />}
              style={styles.applyButton}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {isProcessing ? (
          <View style={styles.processingContainer}>
            <LinearGradient colors={['#FF6B35', '#F7931E']} style={styles.processingGradient}>
              <LoadingSpinner size={80} color="#FFF" />
              <Text style={styles.processingTitle}>Processing Receipt...</Text>
              <Text style={styles.processingSubtitle}>
                {apiConnected 
                  ? 'Analyzing items and optimizing your meal plan'
                  : 'Processing offline - analyzing receipt items'
                }
              </Text>
            </LinearGradient>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={facing}
            >
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={onClose}>
                  <X size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Scan Receipt</Text>
                <TouchableOpacity style={styles.headerButton} onPress={toggleCameraFacing}>
                  <Camera size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* Error Message Display */}
              {errorMessage && (
                <View style={styles.cameraErrorContainer}>
                  <AnimatedCard style={styles.cameraErrorCard}>
                    <View style={styles.errorHeader}>
                      <Text style={styles.cameraErrorText}>{errorMessage}</Text>
                      <TouchableOpacity onPress={dismissError} style={styles.errorDismiss}>
                        <X size={16} color="#DC3545" />
                      </TouchableOpacity>
                    </View>
                  </AnimatedCard>
                </View>
              )}

              {/* Scan Area */}
              <View style={styles.scanArea}>
                <View style={styles.scanFrame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                  
                  {/* Animated scan line */}
                  <Animated.View style={[styles.scanLine, scanLineStyle]} />
                </View>
                
                <Text style={styles.scanInstructions}>
                  Position your receipt within the frame
                </Text>
              </View>

              {/* Controls */}
              <View style={styles.controls}>
                <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
                  <Upload size={24} color="#FFF" />
                  <Text style={styles.controlText}>Gallery</Text>
                </TouchableOpacity>

                <Animated.View style={pulseStyle}>
                  <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                    <View style={styles.captureInner} />
                  </TouchableOpacity>
                </Animated.View>

                <View style={styles.controlSpacer} />
              </View>
            </CameraView>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#333',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  permissionButton: {
    minWidth: 200,
    marginBottom: 20,
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
  },
  camera: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 40 : 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  cameraErrorContainer: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  cameraErrorCard: {
    backgroundColor: 'rgba(255, 245, 245, 0.95)',
    borderLeftWidth: 4,
    borderLeftColor: '#DC3545',
  },
  errorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cameraErrorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#DC3545',
    lineHeight: 20,
    marginRight: 10,
  },
  errorDismiss: {
    padding: 4,
  },
  scanArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  scanFrame: {
    width: 280,
    height: 200,
    position: 'relative',
    marginBottom: 30,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#FF6B35',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#FF6B35',
    opacity: 0.8,
  },
  scanInstructions: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#FFF',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  galleryButton: {
    alignItems: 'center',
    gap: 8,
  },
  controlText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#FFF',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6B35',
  },
  controlSpacer: {
    width: 48,
  },
  processingContainer: {
    flex: 1,
  },
  processingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  processingTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    textAlign: 'center',
    marginTop: 30,
    marginBottom: 10,
  },
  processingSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#FFE5D9',
    textAlign: 'center',
    lineHeight: 24,
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  resultsHeader: {
    paddingTop: Platform.OS === 'web' ? 40 : 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  resultsTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginBottom: 8,
  },
  resultsSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#FFE5D9',
  },
  itemsList: {
    flex: 1,
    padding: 20,
  },
  receiptItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textTransform: 'capitalize',
  },
  itemPrice: {
    alignItems: 'flex-end',
  },
  priceText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#FF6B35',
  },
  quantityText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999',
    marginTop: 2,
  },
  resultsActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 15,
  },
  scanAgainButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#FF6B35',
    paddingVertical: 15,
    borderRadius: 25,
    gap: 8,
  },
  scanAgainText: {
    color: '#FF6B35',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  applyButton: {
    flex: 1,
  },
});

export default ReceiptScanner;
