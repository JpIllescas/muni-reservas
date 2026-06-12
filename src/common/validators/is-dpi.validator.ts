import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsDPIConstraint implements ValidatorConstraintInterface {
  validate(dpi: any) {
    if (typeof dpi !== 'string') return false;
    
    // Quitar espacios o guiones si el usuario los pone
    const cleanDpi = dpi.replace(/[\s-]/g, '');

    // El DPI debe tener exactamente 13 dígitos
    if (!/^[0-9]{13}$/.test(cleanDpi)) return false;

    const numero = cleanDpi.substring(0, 8);
    const validador = parseInt(cleanDpi.substring(8, 9), 10);
    const departamento = parseInt(cleanDpi.substring(9, 11), 10);

    // Guatemala tiene 22 departamentos
    if (departamento === 0 || departamento > 22) return false;

    // Validación Algoritmo Módulo 11 oficial de Guatemala.
    // Los 8 dígitos del correlativo se multiplican por pesos ASCENDENTES
    // (2, 3, 4, ..., 9): el primer dígito por 2 y el octavo por 9.
    let suma = 0;
    for (let i = 0; i < numero.length; i++) {
      suma += parseInt(numero[i], 10) * (i + 2);
    }
    
    const modulo = suma % 11;
    return modulo === validador;
  }

  defaultMessage() {
    return 'El número de DPI ingresado no es válido o no existe.';
  }
}

export function IsDPI(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDPIConstraint,
    });
  };
}
