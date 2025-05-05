#include <stdio.h>

#define WINDOW_SIZE 5

float movingAverage(float* testData, float newValue, int index, float* sum) {
    
    *sum -= testData[index];
    testData[index] = newValue;
    *sum += testData[index];

    return *sum / WINDOW_SIZE;
}

int main() {
    // Test with sample data
    float testData[5];
    float sum = 0;
    for(int i=0;i<5;i++){
        scanf("%f", &testData[i]);
        sum+=testData[i];
    }
    float* ptr = &testData[0];
    int dataSize;
    scanf("%d", &dataSize);
    for(int i = 0; i < dataSize; i++) {
        float newVal;
        scanf("%f", &newVal);
        printf("New value: %.2f, Moving avg: %.2f\n", newVal, movingAverage(testData, newVal, i%5, &sum));
    }
    
    return 0;
}